const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const cors = require("cors");
const dbpath = path.join(__dirname, "memberhub.db");
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

let db = null;
const initializedbserver = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server listening........");
    });
  } catch (e) {
    console.log(`DB error ${e.message}`);
    process.exit(1);
  }
};

initializedbserver();

/////// Get members

app.get("/members", async (request, response) => {
  try {
    const getMembers = `SELECT * FROM members;`;
    const displayMembers = await db.all(getMembers);
    response.status(200).json(displayMembers);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

// Get certificates

app.get("/certificates", async (request, response) => {
  try {
    const getCertificates = `SELECT * FROM certificates;`;
    const displayCertificates = await db.all(getCertificates);
    response.status(200).json(displayCertificates);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

///  add members

app.post("/members", async (request, response) => {
  const { name, email, membership_status, renewal_date } = request.body;
  try {
    const addMemberQuery = `
      INSERT INTO members (name, email, membership_status, renewal_date)
      VALUES ('${name}', '${email}', '${membership_status}', '${renewal_date}');
    `;
    await db.run(addMemberQuery);
    response.status(201).json({ message: "Member added successfully" });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

//////////// add certifictes

app.post("/certificates", async (request, response) => {
  const { member_id, achievement, date, file_path } = request.body;
  try {
    const addCertificateQuery = `
      INSERT INTO certificates (member_id, achievement, date, file_path)
      VALUES ('${member_id}', '${achievement}', '${date}', '${file_path}');
    `;
    await db.run(addCertificateQuery);
    response.status(201).json({
      message: `Certificate added successfully for user with id ${member_id}`,
    });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

module.exports = app;
