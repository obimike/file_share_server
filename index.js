const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

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
  const { email, password, display_name } = req.body;

  console.log(email);

  try {
    // Sign up user with Supabase auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: display_name,
          phone: 234,
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

    console.log(user.user_metadata);
    console.log(user.email);

    // Generate JWT using your secret key
    const secret = "God is able 100%, Ask anybody"; // Replace with a strong secret key
    const payload = { user_id: data.user.id };
    const token = jwt.sign(payload, secret);

    res.json({ token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error });
  }
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = "YOUR_JWT_SECRET";
    const decoded = jwt.verify(token, secret);
    req.user = decoded; // Attach decoded user ID to the request object
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

app.get("/protected", verifyJWT, (req, res) => {
  // Access user ID from req.user
  const userId = req.user.user_id;
  // ... perform actions based on user ID
  res.json({ message: "Welcome, authorized user!" });
});

app.post("/logout", async (req, res) => {
  // Clear any stored user session data (e.g., in req.user)
  req.user = null;
  // Invalidate or revoke the JWT token (optional)
  const { data, error } = await supabase.auth.signOut();
  if (error) return res.status(400).json({ error: error.message });
  res.status(200).json({ message: "Logged out successfully!" });
});


const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server listening on port ${port}`));
