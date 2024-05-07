const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const sodium = require("libsodium-wrappers");

const upload = multer({ dest: "uploads/" });
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
require("dotenv").config();

const supabase = createClient(
  process.env.SupabaseUrl,
  process.env.SupabaseAnonKey
);

let fileSignature = null;

const generateKeys = async () => {
  await sodium.ready;
  const keypair = await sodium.crypto_sign_keypair();
  return {
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
  };
};

const retrieveUint8ArrayFromBase64 = (base64String) => {
  const charArray = atob(base64String).split("");
  const uint8Array = new Uint8Array(charArray.length);
  for (let i = 0; i < charArray.length; i++) {
    uint8Array[i] = charArray[i].charCodeAt(0);
  }
  return uint8Array;
};

// Create a new user
app.post("/signup", async (req, res) => {
  const { email, password, displayName } = req.body;

  try {
    // Sign up user with Supabase auth
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    });

    const { error: storeUserError } = await supabase
      .from("users")
      .insert({ email: email, display_name: displayName });

    if (storeUserError) {
      return res.status(400).json({ error: storeUserError.message });
    }

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

  // console.log(authHeader);

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
  email,
}) => {
  const { error } = await supabase.from("audit_log").insert({
    event_type: eventType,
    done_by: doneBy,
    file_type: fileType,
    file_size: fileSize,
    file_name: fileName,
    email: [email],
  });

  if (error) {
    console.log(error);
    return res.status(400).json({ error: error.message });
  }
};

// check if user is logged in
app.get("/protected", verifyJWT, (req, res) => {
  // Access user ID from req.user
  // ... perform actions based on user ID
  res.json({ message: "Welcome, authorized user!" });
});

// log out route
app.post("/logout", async (req, res) => {
  // Clear any stored user session data (e.g., in req.user)
  req.user = null;
  // Invalidate or revoke the JWT token (optional)
  const { error } = await supabase.auth.signOut();
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

  let pubKey = null;

  try {
    const filePath = req.file.path;
    const fullFileName = `${file_name}.${selectedFileType}`;
    const uploadPath = `uploads/${fullFileName}`;

    if (signFile === "true") {
      // Sign file is user select true
      await sodium.ready;
      const { publicKey, privateKey } = await generateKeys();
      pubKey = publicKey;
      priKey = privateKey;

      // Move the uploaded file to the destination folder
      await fs.renameSync(filePath, path.join("uploads", `${fullFileName}`));

      // Save the signed file
      // await fs.writeFileSync(`uploads/${fullFileName}`, signedFile);

      const fileData = fs.readFileSync(uploadPath);
      const signedFile = await sodium.crypto_sign_detached(
        fileData,
        privateKey
      );
      fileSignature = signedFile;
    } else {
      // Move the uploaded file to the destination folder
      await fs.renameSync(filePath, path.join("uploads", `${fullFileName}`));
    }

    const fileSize = req.file.size.toFixed(3);

    console.log("fileSignature", fileSignature);
    console.log("pubKey", pubKey);

    const { error } = await supabase.from("my_files").insert({
      file_name: file_name,
      file_address: `uploads/${file_name}.${selectedFileType}`,
      is_signed: signFile,
      uploaded_by: upload_by,
      file_type: selectedFileType,
      file_size: fileSize,
      uploader_id: upload_by_id,
      uploader_email: upload_by_email,
      shared_with: upload_by_email,
      file_signature: btoa(String.fromCharCode.apply(null, fileSignature)),
      public_key: btoa(String.fromCharCode.apply(null, pubKey)),
      private_key: btoa(String.fromCharCode.apply(null, priKey)),
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    await auditLog({
      eventType: "File Upload",
      doneBy: upload_by,
      fileType: selectedFileType,
      fileSize: fileSize,
      fileName: file_name,
      email: upload_by_email,
    });

    res.json({ message: "File uploaded successfully!", filename: file_name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error uploading file" });
  }
});

app.post("/verify_file", async (req, res) => {
  const { file_signature, file_address, public_key, private_key } =
    req.body.data;

  const fileSignature = retrieveUint8ArrayFromBase64(file_signature);

  console.log(fileSignature);
  // console.log(retrieveUint8ArrayFromBase64(public_key));

  // Read the signed file
  if (!fs.existsSync(file_address)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  try {
    const fileData = fs.readFileSync(file_address);

    const storedFileSignature = await sodium.crypto_sign_detached(
      fileData,
      retrieveUint8ArrayFromBase64(private_key)
    );

    console.log(storedFileSignature);

    const isVerified = sodium.crypto_sign_verify_detached(
      fileSignature,
      fileData,
      retrieveUint8ArrayFromBase64(public_key)
    );

    if (isVerified) {
      res.send("is verified. It has not been edited or modified.");
    } else {
      res.status(400).json({
        error:
          "File verification failed. It might have been edited or modified.",
      });
    }
  } catch (error) {
    console.error("Error verifying file signature:", error);
    res
      .status(400)
      .json({ verified: false, error: "File signature verification failed" });
  }
});

// Route to select log from the audit_log table
app.get("/logs/:email", async (req, res) => {
  const arrayColumnName = "email";
  const { email } = req.params;

  try {
    // Select all files from the audit_log table
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .textSearch(arrayColumnName, email, "text")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    res.status(200).json(data);
  } catch (error) {
    console.error("Error selecting files from audit_log:", error.message);
    res.status(500).send("Internal server error");
  }
});

// Route to select files from the my_files table
app.get("/files/:email", async (req, res) => {
  const arrayColumnName = "shared_with";
  const { email } = req.params;

  console.log(email);

  try {
    // Select all files from the audit_log table
    const { data, error } = await supabase
      .from("my_files")
      .select("*")
      .textSearch(arrayColumnName, email, "text")
      .order("created_at", { ascending: false });
    if (error) {
      throw error;
    }

    res.status(200).json(data);
  } catch (error) {
    console.error("Error selecting files from my_files:", error.message);
    res.status(500).send("Internal server error");
  }
});

// Route to select files from the my_files table
app.delete("/delete", async (req, res) => {
  console.log("delete route");
  console.log(req.body);

  const { file_id, file_path } = req.body;

  try {
    // fetch file details

    const file = await supabase
      .from("my_files")
      .select("*")
      .eq("id", file_id)
      .single();

    // Delete file record from Supabase DB
    const { error: deleteError } = await supabase
      .from("my_files")
      .delete()
      .eq("id", file_id)
      .single();

    if (deleteError) {
      throw new Error(`Delete error: ${deleteError.message}`);
    }

    // Delete the file from the folder
    await fs.promises.unlink(file_path);

    await auditLog({
      eventType: "Deleted File",
      doneBy: file.data.uploaded_by,
      fileType: file.data.file_type,
      fileSize: file.data.file_size,
      fileName: file.data.file_name,
      email: file.data.shared_with,
    });

    res.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting file" });
  }
});

// Route to share file with email
app.post("/share", async (req, res) => {
  try {
    const { email, fileId } = req.body.data;

    console.log("Sharing file with ", email);

    const { data } = await supabase
      .from("users")
      .select("email")
      .eq("email", email)
      .limit(1);

    console.log(data);

    if (data.length <= 0) {
      return res
        .status(401)
        .json({ message: "User does not have an account." });
    }

    // Check if email already exists in the column shared_with array field
    const { data: isFile } = await supabase
      .from("my_files")
      .select("*")
      .textSearch("shared_with", email, "text")
      .single();

    if (isFile) {
      return res
        .status(404)
        .json({ message: "User already has access to file." });
    } else {
      // Add email to the column array field if response is null
      if (isFile === null) {
        // select only content in the shared_with column array
        const file = await supabase
          .from("my_files")
          .select("*")
          .eq("id", fileId)
          .single();

        let updatedItem = `${file.data.shared_with}, ${email}`;

        const updatedFile = await supabase
          .from("my_files")
          .update({ shared_with: updatedItem })
          .eq("id", fileId);

        if (updatedFile.error) {
          throw updatedFile.error;
        }

        await auditLog({
          eventType: "Shared File",
          doneBy: file.data.uploaded_by,
          fileType: file.data.file_type,
          fileSize: file.data.file_size,
          fileName: file.data.file_name,
          email: updatedItem,
        });
      }
    }

    res.status(200).json({ message: "File shared successfully" });
  } catch (error) {
    console.error("Error sharing file:", error.message);
    res.status(500).send("Internal server error");
  }
});

app.post("/add_log", async (req, res) => {
  const { eventType, doneBy, fileType, fileSize, fileName, sharedWith } =
    req.body;

  try {
    await auditLog({
      eventType,
      doneBy,
      fileType,
      fileSize,
      fileName,
      sharedWith,
    });

    res.json({ message: "Logged successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error });
  }
});

app.get("/test_upload", async (req, res) => {
  try {
    await sodium.ready;
    // Generate Key
    const { publicKey, privateKey } = await generateKeys();
    pubKey = publicKey;
    priKey = privateKey;

    // sign file
    const fileData = "The quick brown fox jumped over the lazy dog.";
    const signature = await sodium.crypto_sign_detached(fileData, privateKey);

    fileSignature = signature;

    res.send(signature);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error });
  }
});

app.get("/test_verify", async (req, res) => {
  try {
    // get the file from storage and  sign it with the same private key
    const fileData = "The quick brown fox jumped over the lazy dog.";

    const { publicKey } = await generateKeys();

    const isVerified = sodium.crypto_sign_verify_detached(
      fileSignature,
      fileData,
      publicKey
    );

    res.json({ message: isVerified });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error });
  }
});

// start server
const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server listening on port ${port}`));
