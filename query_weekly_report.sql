-- =====================================================================================================
-- Weekly Report KebunPRO (ClickHouse / Metabase)
-- 1 baris = 1 kebun (business) × 1 pekan (Senin–Minggu, WIB). Hasil ditempel ke sheet "Weekly report" mulai A1/A2.
-- Periode: 9 pekan = 8 pekan lengkap + pekan berjalan (pekan berjalan otomatis diabaikan script deck).
-- Setiap kebun SELALU punya baris tiap pekan (angka 0 bila tidak ada input), agar kebun yang "diam" terdeteksi.
--
-- Definisi mengikuti query monthly:
--   * jjg_terjual/ton_terjual = transaksi jual lengkap (janjang > 0 DAN berat > 0); tanpa berat dipisah.
--   * pekan panen = tanggal panen, pekan muat = tanggal muat, pekan jual = tanggal input jual, pekan biaya = activity_date.
--   * harga = harga partner per tiket timbang, fallback rata-rata harian; ditimbang tonase per kebun-pekan,
--     fallback harga rata-rata semua kebun di pekan itu. pendapatan = ton_terjual × 1000 × harga.
--   * hari_aktif_input / user_aktif / catatan_* / tgl_input_terakhir memakai TANGGAL INPUT (created_at_utc0),
--     bukan tanggal kegiatan: yang diukur adalah keaktifan memakai KebunPRO.
--   * user_terdaftar = akun login UNIK (contact_detail.user_id) dari kontak kebun yang aktif:
--     business_contact versi terbaru dengan is_active = 1 DAN inactive_at_utc0 IS NULL (semua role).
--   * user_aktif = akun UNIK dari kontak aktif yang sama, yang menginput pada pekan itu.
--     Kontak nonaktif / tanpa akun login tidak dihitung, sehingga user_aktif <= user_terdaftar.
-- Kolom lokasi & akhir_langganan belum ada sumbernya di query ini (dikosongkan); lihat catatan di SELECT akhir.
-- =====================================================================================================
WITH params AS (
    SELECT
        toDate(now() + toIntervalHour(7)) AS today_wib,
        toMonday(today_wib) AS this_monday,
        subtractWeeks(this_monday, 8) AS start_week          -- ubah 8 bila ingin lebih banyak pekan tren
),

business_data AS (
    SELECT
        lower(toString(id)) AS id,
        CAST(name AS String) AS business_name
    FROM default.business
    WHERE (type = 'FARM_GROUP_ASSOCIATION')
      AND (lower(name) NOT LIKE '%test%')
      AND (lower(name) NOT LIKE '%demo%')
      AND (lower(name) NOT LIKE '%onboarding%')
      AND (is_active = 1)
      AND (lower(name) NOT LIKE '%pengguna%')
      AND (lower(name) NOT LIKE '%business farm estate sawitpro%')
      AND (lower(name) NOT LIKE '%cayadi sutanto%')
      AND (lower(toString(id)) NOT LIKE 'd515ac9e-1455-45a0-ba42-7bcb9ef2f9cf')
      AND (position(trimBoth(name), ' ') > 0)
      [[ AND {{ business_name }} ]]
),

-- ===== DEDUP (versi terbaru per id) =====
block_dedup AS (
    SELECT id, business_id, level, area_hectare, is_active
    FROM default.block
    ORDER BY id ASC, updated_at_utc0 DESC NULLS LAST
    LIMIT 1 BY id
),
-- Kontak kebun yang AKTIF (versi terbaru per id) beserta akun login-nya
bc_dedup AS (
    SELECT id, business_id, contact_detail_id, is_active, inactive_at_utc0
    FROM default.business_contact
    ORDER BY id ASC, updated_at_utc0 DESC NULLS LAST
    LIMIT 1 BY id
),
cd_dedup AS (
    SELECT id, user_id
    FROM default.contact_detail
    ORDER BY id ASC, updated_at_utc0 DESC NULLS LAST
    LIMIT 1 BY id
),
active_accounts AS (
    SELECT
        lower(toString(bc.id)) AS acc_contact_id,
        lower(toString(bc.business_id)) AS acc_business_id,
        nullIf(toString(cd.user_id), '') AS acc_user_id
    FROM bc_dedup AS bc
    INNER JOIN business_data AS bd ON lower(toString(bc.business_id)) = bd.id
    LEFT JOIN cd_dedup AS cd ON toUUIDOrNull(toString(cd.id)) = bc.contact_detail_id
    WHERE (bc.is_active = 1)
      AND (bc.inactive_at_utc0 IS NULL)
),
users_registered AS (
    SELECT acc_business_id AS reg_business_id, uniqExactIf(acc_user_id, acc_user_id IS NOT NULL) AS u_registered
    FROM active_accounts
    GROUP BY acc_business_id
),
collection_point_dedup AS (
    SELECT id, block_id
    FROM default.block_collection_point
    ORDER BY id ASC, updated_at_utc0 DESC NULLS LAST
    LIMIT 1 BY id
),
-- CATATAN: created_at_utc0 diasumsikan ada di activity_harvesting, activity_load, dan plantation_activity_detail_cost
-- (sudah dipakai di plantation_ffb_sale). Bila tidak ada, ganti dengan updated_at_utc0.
harvest_raw AS (
    SELECT
        lower(toString(h.id)) AS id,
        lower(toString(coalesce(toUUIDOrNull(toString(h.block)), toUUIDOrNull(toString(cp.block_id))))) AS block_id,
        toFloat64(ifNull(h.ffb_quantity, 0)) AS jjg,
        toDate(toDateTime(h.harvesting_date_utc0 / 1000) + toIntervalHour(7)) AS act_date,
        toDate(toDateTime(h.created_at_utc0 / 1000) + toIntervalHour(7)) AS input_date,
        lower(ifNull(toString(h.supervisor), '')) AS contact_fallback,
        h.is_active AS is_active
    FROM default.activity_harvesting AS h
    LEFT JOIN collection_point_dedup AS cp ON toString(cp.id) = toString(h.collection_point_id)
    ORDER BY h.id ASC, h.updated_at_utc0 DESC NULLS LAST
    LIMIT 1 BY h.id
),
load_raw AS (
    SELECT
        lower(toString(id)) AS id,
        lower(toString(block_id)) AS block_id,
        lower(ifNull(toString(plantation_delivery_trip_id), '')) AS trip_id,
        toFloat64(ifNull(ffb_quantity, 0)) AS jjg,
        toDate(toDateTime(loading_date_utc0 / 1000) + toIntervalHour(7)) AS act_date,
        toDate(toDateTime(created_at_utc0 / 1000) + toIntervalHour(7)) AS input_date,
        lower(ifNull(toString(supervisor_id), '')) AS contact_fallback,
        is_active
    FROM default.activity_load
    ORDER BY id ASC, updated_at_utc0 DESC NULLS LAST
    LIMIT 1 BY id
),
sale_raw AS (
    SELECT
        lower(toString(id)) AS id,
        lower(toString(block_id)) AS block_id,
        toFloat64(ifNull(quantity, 0)) AS qty,
        toFloat64(ifNull(total_weight_kg, 0)) AS weight_kg,
        toDate(toDateTime(created_at_utc0 / 1000) + toIntervalHour(7)) AS input_date,   -- = tanggal jual (sama dengan monthly)
        is_active
    FROM default.plantation_ffb_sale
    ORDER BY id ASC, updated_at_utc0 DESC NULLS LAST
    LIMIT 1 BY id
),
cost_raw AS (
    SELECT
        lower(toString(id)) AS id,
        lower(toString(business_id)) AS business_id,
        lower(toString(block_id)) AS block_id,
        upper(trimBoth(toString(activity_category))) AS cat,
        toFloat64(total_cost) AS total_cost,
        quantity,
        toDate(toDateTime(activity_date / 1000) + toIntervalHour(7)) AS act_date,
        toDate(toDateTime(created_at_utc0 / 1000) + toIntervalHour(7)) AS input_date,
        lower(ifNull(toString(business_contact_id), '')) AS contact_fallback,
        is_active
    FROM default.plantation_activity_detail_cost
    ORDER BY id ASC, updated_at_utc0 DESC NULLS LAST
    LIMIT 1 BY id
),
active_trip AS (
    SELECT lower(toString(id)) AS id
    FROM (
        SELECT id, is_active
        FROM default.plantation_delivery_trip
        ORDER BY id ASC, updated_at_utc0 DESC NULLS LAST
        LIMIT 1 BY id
    )
    WHERE is_active = true
),

-- ===== BLOK SAH (aktif, level BLOCK, milik business yang lolos filter) =====
valid_block AS (
    SELECT
        lower(toString(b.id)) AS block_id,
        bd.id AS business_id,
        toFloat64(ifNull(b.area_hectare, 0.)) AS area_ha
    FROM block_dedup AS b
    INNER JOIN business_data AS bd ON lower(toString(b.business_id)) = bd.id
    WHERE (b.is_active = true)
      AND (ifNull(nullIf(toString(b.level), ''), 'BLOCK') = 'BLOCK')
),
business_area AS (
    SELECT business_id, round(sum(area_ha), 2) AS area_total, countIf(area_ha <= 0) AS block_no_area
    FROM valid_block
    GROUP BY business_id
),

-- ===== KEGIATAN per kebun (dipakai untuk produksi & keaktifan) =====
-- Kolom ditulis eksplisit (bukan h.*): analyzer ClickHouse 24.x tidak meneruskan kolom * dari JOIN dengan andal.
harvest AS (
    SELECT
        vb.business_id AS business_id, h.id AS id, h.block_id AS block_id, h.jjg AS jjg,
        h.act_date AS act_date, h.input_date AS input_date, h.contact_fallback AS contact_fallback
    FROM harvest_raw AS h
    INNER JOIN valid_block AS vb ON vb.block_id = h.block_id
    WHERE (h.is_active = true)
      AND ((h.act_date >= subtractDays((SELECT start_week FROM params), 180)) OR (h.input_date >= subtractDays((SELECT start_week FROM params), 180)))
),
loads AS (
    SELECT
        vb.business_id AS business_id, l.id AS id, l.block_id AS block_id, l.trip_id AS trip_id, l.jjg AS jjg,
        l.act_date AS act_date, l.input_date AS input_date, l.contact_fallback AS contact_fallback
    FROM load_raw AS l
    INNER JOIN valid_block AS vb ON vb.block_id = l.block_id
    WHERE (l.is_active = true)
      AND ((l.act_date >= subtractDays((SELECT start_week FROM params), 180)) OR (l.input_date >= subtractDays((SELECT start_week FROM params), 180)))
),
sales AS (
    SELECT
        vb.business_id AS business_id, s.id AS id, s.block_id AS block_id, s.qty AS qty, s.weight_kg AS weight_kg,
        s.input_date AS input_date, (s.qty > 0) AND (s.weight_kg > 0) AS is_complete
    FROM sale_raw AS s
    INNER JOIN valid_block AS vb ON vb.block_id = s.block_id
    WHERE (s.is_active = true)
      AND (s.input_date >= subtractDays((SELECT start_week FROM params), 180))
),
costs AS (
    SELECT
        bd.id AS business_id, c.id AS id, c.cat AS cat, c.total_cost AS total_cost, c.quantity AS quantity,
        c.act_date AS act_date, c.input_date AS input_date, c.contact_fallback AS contact_fallback
    FROM cost_raw AS c
    INNER JOIN business_data AS bd ON bd.id = c.business_id
    -- biaya di level BLOCK maupun DIVISION (afdeling), sama dengan query biaya monthly
    INNER JOIN block_dedup AS b ON lower(toString(b.id)) = c.block_id
    WHERE (c.is_active = true)
      AND (b.is_active = true)
      AND (ifNull(nullIf(toString(b.level), ''), 'BLOCK') IN ('BLOCK', 'DIVISION'))
      AND ((c.act_date >= subtractDays((SELECT start_week FROM params), 180)) OR (c.input_date >= subtractDays((SELECT start_week FROM params), 180)))
),

-- ===== KEAKTIFAN INPUT (tanggal input) =====
input_events AS (
    SELECT business_id, id AS activity_id, 'panen' AS kind, input_date, contact_fallback FROM harvest
    UNION ALL
    SELECT business_id, id AS activity_id, 'muat' AS kind, input_date, contact_fallback FROM loads
    UNION ALL
    SELECT business_id, id AS activity_id, 'jual' AS kind, input_date, '' AS contact_fallback FROM sales
    UNION ALL
    SELECT business_id, id AS activity_id, if(cat = 'UPKEEP', 'rawat', 'biaya') AS kind, input_date, contact_fallback FROM costs
),
log_contact AS (
    SELECT lower(toString(pal.activity_id)) AS log_activity_id, any(lower(toString(pal.contact_id))) AS log_contact_id
    FROM default.plantation_activity_log AS pal
    WHERE (pal.is_active = 1)
      AND (pal.app_source = 'KEBUNPRO')
      AND (pal.status = 'SUCCESS')
      AND (lower(toString(pal.activity_id)) IN (SELECT activity_id FROM input_events))
    GROUP BY log_activity_id
),
events AS (
    SELECT
        e.business_id AS business_id,
        toMonday(e.input_date) AS wk,
        e.input_date AS input_date,
        e.kind AS kind,
        e.activity_id AS activity_id,
        coalesce(nullIf(lc.log_contact_id, ''), nullIf(e.contact_fallback, '')) AS contact
    FROM input_events AS e
    LEFT JOIN log_contact AS lc ON lc.log_activity_id = e.activity_id
    WHERE (e.input_date >= (SELECT start_week FROM params))
      AND (e.input_date <= (SELECT today_wib FROM params))
),
activity_w AS (
    SELECT
        ev.business_id AS business_id, ev.wk AS wk,
        uniqExact(ev.input_date) AS a_days,
        -- akun unik dari kontak aktif (is_active = 1, inactive_at_utc0 IS NULL) yang menginput pekan ini
        uniqExactIf(aa.acc_user_id, aa.acc_user_id IS NOT NULL) AS a_users,
        uniqExactIf(ev.activity_id, ev.kind = 'panen') AS a_panen,
        uniqExactIf(ev.activity_id, ev.kind = 'muat')  AS a_muat,
        uniqExactIf(ev.activity_id, ev.kind = 'jual')  AS a_jual,
        uniqExactIf(ev.activity_id, ev.kind = 'rawat') AS a_rawat
    FROM events AS ev
    LEFT JOIN active_accounts AS aa ON (aa.acc_contact_id = ev.contact) AND (aa.acc_business_id = ev.business_id)
    GROUP BY ev.business_id, ev.wk
),
-- semua tanggal input (sampai 180 hari sebelum periode) untuk tgl_input_terakhir per pekan
input_dates AS (
    SELECT business_id, groupUniqArray(input_date) AS dates
    FROM input_events
    WHERE input_date <= (SELECT today_wib FROM params)
    GROUP BY business_id
),

-- ===== PRODUKSI per pekan =====
harvest_w AS (
    SELECT business_id, toMonday(act_date) AS wk, sum(jjg) AS p_harvest
    FROM harvest
    WHERE act_date >= (SELECT start_week FROM params)
    GROUP BY business_id, wk
),
load_w AS (
    SELECT business_id, toMonday(act_date) AS wk,
        sum(jjg) AS p_load,
        sumIf(jjg, trip_id IN (SELECT id FROM active_trip)) AS p_trip
    FROM loads
    WHERE act_date >= (SELECT start_week FROM params)
    GROUP BY business_id, wk
),
sale_w AS (
    SELECT business_id, toMonday(input_date) AS wk,
        sumIf(qty, is_complete) AS p_sold,
        sumIf(qty, (qty > 0) AND (weight_kg <= 0)) AS p_sold_noweight,
        sumIf(weight_kg, is_complete) / 1000. AS p_ton
    FROM sales
    WHERE input_date >= (SELECT start_week FROM params)
    GROUP BY business_id, wk
),
-- luas panen = blok UNIK yang di pekan itu ada panen ATAU penjualan lengkap
area_w AS (
    SELECT x.business_id AS business_id, x.wk AS wk, sum(vb.area_ha) AS p_area
    FROM (
        SELECT business_id, toMonday(act_date) AS wk, block_id FROM harvest
        WHERE (act_date >= (SELECT start_week FROM params)) AND (jjg > 0)
        UNION DISTINCT
        SELECT business_id, toMonday(input_date) AS wk, block_id FROM sales
        WHERE (input_date >= (SELECT start_week FROM params)) AND is_complete
    ) AS x
    INNER JOIN valid_block AS vb ON vb.block_id = x.block_id
    GROUP BY x.business_id, x.wk
),

-- ===== BIAYA per pekan (activity_date; filter sama dengan query biaya monthly) =====
cost_w AS (
    SELECT business_id, toMonday(act_date) AS wk,
        sumIf(total_cost, cat = 'HARVEST') AS c_harvest,
        sumIf(total_cost, cat = 'LOAD')    AS c_load,
        sumIf(total_cost, cat = 'UPKEEP')  AS c_upkeep
    FROM costs
    WHERE (act_date >= (SELECT start_week FROM params))
      AND (cat IN ('UPKEEP', 'HARVEST', 'LOAD'))
      AND (total_cost IS NOT NULL) AND (total_cost > 0)
      AND ((quantity IS NULL) OR (total_cost != toFloat64(quantity)))
    GROUP BY business_id, wk
),

-- ===== HARGA TBS per pekan (sama dengan monthly: partner, fallback rata-rata harian) =====
ffb_price_partner AS (
    SELECT
        toString(p.partner_id) AS partner_id,
        toFloat64(pc.price) AS unit_price_idr,
        toUnixTimestamp(toDateTime(pc.start_date_utc0 / 1000)) AS start_date_sec,
        if(pc.end_date_utc0 > 0, toUnixTimestamp(toDateTime(pc.end_date_utc0 / 1000)), 0) AS end_date_sec
    FROM default.plantations_ffb_sales_price AS p
    INNER JOIN default.plantations_ffb_sales_price_category AS pc
        ON toString(p.id) = toString(pc.plantations_ffb_sales_price_id)
    WHERE (p.is_active = true) AND (pc.is_active = true) AND (pc.price > 0)
),
ffb_daily_avg_price AS (
    SELECT
        toDate(toDateTime(pc.start_date_utc0 / 1000) + toIntervalHour(7)) AS price_date,
        avg(toFloat64(pc.price)) AS avg_daily_price_idr
    FROM default.plantations_ffb_sales_price AS p
    INNER JOIN default.plantations_ffb_sales_price_category AS pc
        ON toString(p.id) = toString(pc.plantations_ffb_sales_price_id)
    WHERE (p.is_active = true) AND (pc.is_active = true) AND (pc.price > 0)
    GROUP BY price_date
),
ad AS (
    SELECT
        toString(ad.weighbridge_ticket_number) AS weighbridge_ticket_number,
        lower(toString(ad.business_id)) AS business_id,
        toString(ad.partner_id) AS partner_id,
        toDate(toDateTime(ad.delivered_at_utc0 / 1000) + toIntervalHour(7)) AS delivered_date_tz,
        toUnixTimestamp(toDateTime(ad.delivered_at_utc0 / 1000)) AS delivered_at_sec
    FROM default.activity_delivery AS ad
    WHERE (ad.is_active = true)
      AND (ad.weighbridge_ticket_number IS NOT NULL)
      AND (ad.delivered_at_utc0 > 0)
      AND (lower(toString(ad.business_id)) IN (SELECT id FROM business_data))
      AND (toDate(toDateTime(ad.delivered_at_utc0 / 1000) + toIntervalHour(7)) >= (SELECT start_week FROM params))
      AND (toDate(toDateTime(ad.delivered_at_utc0 / 1000) + toIntervalHour(7)) <= (SELECT today_wib FROM params))
    ORDER BY ad.weighbridge_ticket_number ASC, ad.updated_at_utc0 DESC NULLS LAST
    LIMIT 1 BY ad.weighbridge_ticket_number
),
matched_partner_price AS (
    SELECT ad.weighbridge_ticket_number, argMax(pp.unit_price_idr, pp.start_date_sec) AS partner_price_idr
    FROM ad
    INNER JOIN ffb_price_partner AS pp ON pp.partner_id = ad.partner_id
    WHERE (ad.delivered_at_sec >= pp.start_date_sec)
      AND ((pp.end_date_sec = 0) OR (ad.delivered_at_sec <= pp.end_date_sec))
    GROUP BY ad.weighbridge_ticket_number
),
wt AS (
    SELECT
        toString(ticket_no) AS ticket_no,
        toFloat64(weight_net_kg) AS weight_net_kg,
        toFloat64(weight_net_adjusted_kg) AS weight_net_adjusted_kg
    FROM default.weighbridge_ticket
    WHERE (is_active = true)
      AND (toString(ticket_no) IN (SELECT weighbridge_ticket_number FROM ad))
    ORDER BY ticket_no ASC, updated_at_utc0 DESC NULLS LAST
    LIMIT 1 BY ticket_no
),
ticket_price AS (
    SELECT
        ad.business_id AS business_id,
        toMonday(ad.delivered_date_tz) AS wk,
        coalesce(wt.weight_net_adjusted_kg, wt.weight_net_kg, 0.) AS kg,
        coalesce(nullIf(mpp.partner_price_idr, 0.), avg_p.avg_daily_price_idr, 0.) AS price
    FROM ad
    INNER JOIN wt ON wt.ticket_no = ad.weighbridge_ticket_number
    LEFT JOIN matched_partner_price AS mpp ON mpp.weighbridge_ticket_number = ad.weighbridge_ticket_number
    LEFT JOIN ffb_daily_avg_price AS avg_p ON avg_p.price_date = ad.delivered_date_tz
),
price_bw AS (   -- per kebun per pekan
    SELECT business_id, wk, if(sumIf(kg, price > 0) = 0, 0., sumIf(kg * price, price > 0) / sumIf(kg, price > 0)) AS pr_business
    FROM ticket_price
    GROUP BY business_id, wk
),
price_gw AS (   -- cadangan: rata-rata semua kebun per pekan
    SELECT wk, if(sumIf(kg, price > 0) = 0, 0., sumIf(kg * price, price > 0) / sumIf(kg, price > 0)) AS pr_all
    FROM ticket_price
    GROUP BY wk
),

-- ===== GRID kebun × pekan (kebun tanpa input tetap punya baris) =====
weeks AS (
    SELECT subtractWeeks((SELECT this_monday FROM params), number) AS wk
    FROM numbers(9)
),
-- kebun pelanggan = business yang punya input dalam 180 hari sebelum periode s.d. hari ini (akun mati tidak ikut)
kebun AS (
    SELECT bd.id AS business_id, bd.business_name AS business_name
    FROM business_data AS bd
    WHERE bd.id IN (SELECT business_id FROM input_events)
),
grid AS (
    SELECT k.business_id AS business_id, k.business_name AS business_name, w.wk AS wk
    FROM kebun AS k
    CROSS JOIN weeks AS w
)

SELECT
    g.wk                                                       AS week_start,
    g.business_id                                              AS kebun_id,
    g.business_name                                            AS nama_kebun,
    ''                                                         AS lokasi,            -- TODO: isi dari tabel alamat business bila ada
    ifNull(ba.area_total, 0.)                                  AS luas_total_ha,
    CAST(NULL AS Nullable(Date))                               AS akhir_langganan,   -- TODO: isi dari tabel langganan/subscription
    ifNull(a.a_days, 0)                                        AS hari_aktif_input,
    if(empty(arrayFilter(d -> d <= addDays(g.wk, 6), idt.dates)), NULL,
       arrayMax(arrayFilter(d -> d <= addDays(g.wk, 6), idt.dates)))  AS tgl_input_terakhir,
    ifNull(up.u_registered, 0)                                 AS user_terdaftar,
    ifNull(a.a_users, 0)                                       AS user_aktif,
    ifNull(a.a_panen, 0)                                       AS catatan_panen,
    ifNull(a.a_muat, 0)                                        AS catatan_muat,
    ifNull(a.a_jual, 0)                                        AS catatan_jual,
    ifNull(a.a_rawat, 0)                                       AS catatan_rawat,
    round(ifNull(hw.p_harvest, 0))                             AS jjg_dipanen,
    round(ifNull(lw.p_load, 0))                                AS jjg_dimuat,
    round(ifNull(lw.p_trip, 0))                                AS jjg_masuk_trip,
    round(ifNull(sw.p_sold, 0))                                AS jjg_terjual,
    round(ifNull(sw.p_sold_noweight, 0))                       AS jjg_terjual_tanpa_berat,
    round(ifNull(sw.p_ton, 0), 2)                              AS ton_terjual,
    round(ifNull(aw.p_area, 0), 2)                             AS luas_panen_ha,
    round(coalesce(nullIf(pb.pr_business, 0.), nullIf(pg.pr_all, 0.), 0.))                    AS harga_rata_rp_kg,
    round(ifNull(sw.p_ton, 0) * 1000. * coalesce(nullIf(pb.pr_business, 0.), nullIf(pg.pr_all, 0.), 0.)) AS pendapatan_rp,
    round(ifNull(cw.c_harvest, 0))                             AS biaya_panen_rp,
    round(ifNull(cw.c_load, 0))                                AS biaya_muat_rp,
    round(ifNull(cw.c_upkeep, 0))                              AS biaya_rawat_rp,
    ifNull(ba.block_no_area, 0)                                AS blok_tanpa_luas
FROM grid AS g
LEFT JOIN business_area AS ba ON ba.business_id = g.business_id
LEFT JOIN users_registered AS up ON up.reg_business_id = g.business_id
LEFT JOIN input_dates   AS idt ON idt.business_id = g.business_id
LEFT JOIN activity_w    AS a  ON (a.business_id = g.business_id)  AND (a.wk = g.wk)
LEFT JOIN harvest_w     AS hw ON (hw.business_id = g.business_id) AND (hw.wk = g.wk)
LEFT JOIN load_w        AS lw ON (lw.business_id = g.business_id) AND (lw.wk = g.wk)
LEFT JOIN sale_w        AS sw ON (sw.business_id = g.business_id) AND (sw.wk = g.wk)
LEFT JOIN area_w        AS aw ON (aw.business_id = g.business_id) AND (aw.wk = g.wk)
LEFT JOIN cost_w        AS cw ON (cw.business_id = g.business_id) AND (cw.wk = g.wk)
LEFT JOIN price_bw      AS pb ON (pb.business_id = g.business_id) AND (pb.wk = g.wk)
LEFT JOIN price_gw      AS pg ON pg.wk = g.wk
ORDER BY week_start ASC, nama_kebun ASC
SETTINGS join_use_nulls = 1
