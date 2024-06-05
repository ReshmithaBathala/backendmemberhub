const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const cors = require("cors");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const sgMail = require("@sendgrid/mail");
require("dotenv").config();

const dbpath = path.join(__dirname, "memberhub.db");
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/certificates", express.static(path.join(__dirname, "certificates")));

let db = null;
const initializedbserver = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });

    // Schedule a task to send reminders
    cron.schedule("0 0 * * *", async () => {
      try {
        // Query members whose renewal date is approaching
        const approachingRenewalQuery = `
          SELECT * FROM members
          WHERE DATE(renewal_date) BETWEEN DATE('now') AND DATE('now', '+7 day');
        `;
        const approachingRenewalMembers = await db.all(approachingRenewalQuery);

        // Send reminders to approaching renewal members
        approachingRenewalMembers.forEach(async (member) => {
          await sendReminderEmail(member.email, member.name);
        });

        console.log("Reminder emails sent successfully");
      } catch (error) {
        console.error("Error sending reminder emails:", error);
      }
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
async function sendReminderEmail(email, name) {
  // Set your SendGrid API key here
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  // Configure email options
  const msg = {
    to: email,
    from: "your-email@example.com", // Use your verified sender email
    subject: "Membership Renewal Reminder",
    text: `Hi ${name},\n\nThis is a friendly reminder that your membership renewal date is approaching. Please renew your membership at your earliest convenience.\n\nBest regards,\nYour Organization`,
  };

  // Send email
  try {
    await sgMail.send(msg);
    console.log("Reminder email sent successfully");
  } catch (error) {
    console.error("Error sending reminder email:", error);
    throw error;
  }
}

// Create directory for storing certificates if it doesn't exist
const certificatesDirectory = path.join(__dirname, "certificates");
if (!fs.existsSync(certificatesDirectory)) {
  fs.mkdirSync(certificatesDirectory);
}

// Function to generate PDF certificate
const generateCertificate = async (member_id, name, achievement, date) => {
  return new Promise((resolve, reject) => {
    // Create a new PDF document
    const doc = new PDFDocument();

    // Set up file path for the generated certificate
    const filePath = `./certificates/certificate_${member_id}_${Date.now()}.pdf`;

    // Pipe PDF content to a writable stream
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Add content to the PDF document
    doc.fontSize(16).text(`Certificate of Achievement`, { align: "center" });
    doc.moveDown();
    doc
      .fontSize(14)
      .text(`This certificate is awarded to:`, { align: "center" });
    doc
      .fontSize(18)
      .text(`${name}`, { align: "center", underline: true })
      .moveDown();
    doc
      .fontSize(14)
      .text(`For outstanding achievement in:`, { align: "center" });
    doc
      .fontSize(18)
      .text(`${achievement}`, { align: "center", underline: true })
      .moveDown();
    doc.fontSize(14).text(`Date: ${date}`, { align: "center" }).moveDown(2);
    doc
      .fontSize(12)
      .text(`Issued on behalf of the Organization....`, { align: "center" });

    // Finalize the PDF document
    doc.end();

    // Resolve the promise with the file path
    stream.on("finish", () => resolve(filePath));
    stream.on("error", (error) => reject(error));
  });
};

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
  const { member_id, achievement, date } = request.body;
  try {
    // Fetch member's name from the database based on member_id
    const getMemberQuery = `SELECT name FROM members WHERE id = ${member_id};`;
    const member = await db.get(getMemberQuery);

    if (!member) {
      return response.status(404).json({ error: "Member not found" });
    }

    const name = member.name;

    // Generate certificate dynamically
    const certificateFilePath = await generateCertificate(
      member_id,
      name,
      achievement,
      date
    );

    // Save certificate file path to the database
    const addCertificateQuery = `
      INSERT INTO certificates (member_id, achievement, date, file_path)
      VALUES ('${member_id}', '${achievement}', '${date}', '${certificateFilePath}');
    `;
    db.run(addCertificateQuery);

    response.status(201).json({
      message: `Certificate added successfully for user with id ${member_id}`,
      certificateFilePath: certificateFilePath, // Send back the file path to frontend
    });
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/view-certificate", (request, response) => {
  const { certificateFilePath } = request.query; // Assuming certificateFilePath is passed as a query parameter

  // Read the PDF file content
  fs.readFile(certificateFilePath, (err, data) => {
    if (err) {
      return response.status(500).json({ error: "Error reading PDF file" });
    }

    // Set content type as application/pdf
    response.setHeader("Content-Type", "application/pdf");

    // Send the PDF file content in the response
    response.send(data);
  });
});

/// display certificates for each member
app.get("/certificates/:member_id", async (request, response) => {
  const { member_id } = request.params;
  try {
    const getCertificatesQuery = `
      SELECT * FROM certificates
      WHERE member_id = '${member_id}';
    `;
    const certificates = await db.all(getCertificatesQuery);
    response.status(200).json(certificates);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.get("/view-certificate/:certificateId", async (request, response) => {
  const { certificateId } = request.params;
  try {
    const getCertificateQuery = `SELECT * FROM certificates WHERE id = ?`;
    const certificate = await db.get(getCertificateQuery, [certificateId]);

    if (!certificate) {
      return response.status(404).json({ error: "Certificate not found" });
    }

    const certificatePath = path.join(__dirname, certificate.file_path);
    response.sendFile(certificatePath);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

// Endpoint to manually send reminder emails
app.post("/send-reminders", async (request, response) => {
  try {
    // Query members whose renewal date is approaching
    const approachingRenewalQuery = `
      SELECT * FROM members
      WHERE DATE(renewal_date) BETWEEN DATE('now') AND DATE('now', '+7 day');
    `;
    const approachingRenewalMembers = await db.all(approachingRenewalQuery);

    // Send reminders to approaching renewal members
    for (const member of approachingRenewalMembers) {
      await sendReminderEmail(member.email, member.name);
    }

    response.status(200).json({ message: "Reminder emails sent successfully" });
  } catch (error) {
    console.error("Error sending reminder emails:", error);
    response.status(500).json({ error: error.message });
  }
});

module.exports = app;
