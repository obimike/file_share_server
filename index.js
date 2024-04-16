const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const multer = require("multer");
const fs = require("fs");
const path = require("path");

const upload = multer({ dest: "uploads/" });

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const supabaseUrl = "https://lgiyraqbofoduruqhmzy.supabase.co"; // Replace with your Supabase URL
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnaXlyYXFib2ZvZHVydXFobXp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTI5MjQyMTcsImV4cCI6MjAyODUwMDIxN30.lVf6NNj1FNtzhcq2ZU4ZRzzMFXL_edRc3JfiSR2fY90"; // Replace with your Anon key
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Create a new user
app.post("/signup", async (req, res) => {
  const { email, password, displayName } = req.body;

  try {
    // Sign up user with Supabase auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ message: "User created successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// login api route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Generate JWT using your secret key
    const secret = "God is able 100%, Ask anybody"; // Replace with a strong secret key
    const payload = { user_id: data.user.id };
    const token = jwt.sign(payload, secret);

    console.log("Logged in with: ", user.email);

    res.json({
      token,
      user: {
        id: user.id,
        display_name: user.user_metadata.display_name,
        email: user.user_metadata.email,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error });
  }
});

// token verification function
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  console.log(authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = "God is able 100%, Ask anybody";
    const decoded = jwt.verify(token, secret);
    req.user = decoded; // Attach decoded user ID to the request object
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const auditLog = async ({
  eventType,
  doneBy,
  fileType,
  fileSize,
  fileName,
}) => {
  const { error } = await supabase.from("audit_log").insert({
    event_type: eventType,
    done_by: doneBy,
    file_type: fileType,
    file_size: fileSize,
    file_name: fileName,
  });

  if (error) {
    console.log(error);
    return res.status(400).json({ error: error.message });
  }
};

// check if user is logged in
app.get("/protected", verifyJWT, (req, res) => {
  // Access user ID from req.user
  const userId = req.user.user_id;
  // ... perform actions based on user ID
  res.json({ message: "Welcome, authorized user!" });
});

// log out route
app.post("/logout", async (req, res) => {
  // Clear any stored user session data (e.g., in req.user)
  req.user = null;
  // Invalidate or revoke the JWT token (optional)
  const { data, error } = await supabase.auth.signOut();
  if (error) return res.status(400).json({ error: error.message });
  res.status(200).json({ message: "Logged out successfully!" });
});

// file upload route
app.post("/upload", verifyJWT, upload.single("file"), async (req, res) => {
  const {
    file_name,
    signFile,
    selectedFileType,
    upload_by,
    upload_by_id,
    upload_by_email,
  } = req.body;

  try {
    // Move the uploaded file to the destination folder
    await fs.renameSync(
      req.file.path,
      path.join("uploads", `${file_name}.${selectedFileType}`)
    );

    const fileSize = req.file.size.toFixed(3);

    const { error } = await supabase.from("my_files").insert({
      file_name: file_name,
      file_address: `./uploads/${file_name}.${selectedFileType}`,
      is_signed: signFile,
      uploaded_by: upload_by,
      file_type: selectedFileType,
      file_size: fileSize,
      uploader_id: upload_by_id,
      uploader_email: upload_by_email,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    await auditLog({
      eventType: "file_uploaded",
      doneBy: upload_by,
      fileType: selectedFileType,
      fileSize: fileSize,
      fileName: file_name,
    });

    res.json({ message: "File uploaded successfully!", filename: file_name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error uploading file" });
  }
});

// start server
const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server listening on port ${port}`));
