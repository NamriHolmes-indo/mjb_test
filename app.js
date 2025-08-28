const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const app = express();

app.use(express.static("public"));

const pool = new Pool({
  user: "mjb_dev",
  host: "localhost",
  database: "lab",
  password: "mjb_dev123",
  port: 5432,
});

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("public"));

let cart = [];

app.get("/", async (req, res) => {
  try {
    const itemsResult = await pool.query(
      "SELECT * FROM test_mjb.items ORDER BY id_barang"
    );
    const transaksiResult = await pool.query(
      "SELECT * FROM test_mjb.vw_detail_transaksi"
    );
    res.render("index", {
      items: itemsResult.rows,
      transaksi: transaksiResult.rows,
      cart: cart,
    });
  } catch (error) {
    console.error(error);
    res.send("Error loading data");
  }
});

app.post("/items/new", async (req, res) => {
  const { id_barang, satuan, stok, harga_satuan, status } = req.body;
  try {
    await pool.query(
      `INSERT INTO test_mjb.items (id_barang, satuan, jumlah, harga_satuan, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [id_barang, satuan, stok || 0, harga_satuan, status || "A"]
    );
    res.redirect("/");
  } catch (error) {
    console.error(error);
    res.send("Error saat menambah item");
  }
});

app.post("/transaksi/new", async (req, res) => {
  const { tanggal_transaksi } = req.body;
  try {
    await pool.query(
      "INSERT INTO test_mjb.transactions (tanggal_transaksi) VALUES ($1)",
      [tanggal_transaksi]
    );
    res.redirect("/");
  } catch (error) {
    console.error(error);
    res.send("Error saat menambah transaksi");
  }
});

app.post("/cart/add", async (req, res) => {
  const { id_barang, jumlah } = req.body;
  const qty = parseInt(jumlah);
  try {
    const result = await pool.query(
      "SELECT * FROM test_mjb.items WHERE id_barang = $1",
      [id_barang]
    );
    if (result.rows.length === 0) return res.send("Barang tidak ditemukan");
    const item = result.rows[0];
    if (item.jumlah < qty) return res.send("Stok tidak mencukupi");

    const existing = cart.find((c) => c.id_barang == id_barang);
    if (existing) {
      if (item.jumlah < existing.jumlah + qty)
        return res.send("Stok tidak mencukupi untuk tambahan");
      existing.jumlah += qty;
    } else {
      cart.push({
        id_barang: item.id_barang,
        jumlah: qty,
        nama_barang: item.nama_barang,
        satuan: item.satuan,
        harga_satuan: item.harga_satuan,
      });
    }
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.send("Error saat menambah ke keranjang");
  }
});

app.post("/checkout", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO test_mjb.transactions (tanggal_transaksi)
       VALUES (CURRENT_DATE)
       RETURNING id_transaksi, nomor_transaksi`
    );
    const transaksi = result.rows[0];

    for (const item of cart) {
      const total = item.jumlah * item.harga_satuan;
      await client.query(
        `INSERT INTO test_mjb.items_transaction 
   (id_transaksi, id_barang, jumlah, satuan, harga_satuan) 
   VALUES ($1, $2, $3, $4, $5)`,
        [
          transaksi.id_transaksi,
          item.id_barang,
          item.jumlah,
          item.satuan,
          item.harga_satuan,
        ]
      );

      await client.query(
        `UPDATE test_mjb.items SET jumlah = jumlah - $1 WHERE id_barang = $2`,
        [item.jumlah, item.id_barang]
      );
    }

    await client.query("COMMIT");
    cart = [];
    res.json({
      id_transaksi: transaksi.id_transaksi,
      nomor_transaksi: transaksi.nomor_transaksi,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).send("Error saat checkout");
  } finally {
    client.release();
  }
});

app.post("/cart/clear", (req, res) => {
  cart = [];
  res.redirect("/");
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
