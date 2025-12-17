require("dotenv").config();
const admin = require("firebase-admin");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const stripe = require('stripe')(process.env.stripe_secret);
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');


// const serviceAccount = require("./firebase-admin-key.json");

const decoded = Buffer.from(process.env.fb_service_key, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
console.log("Firebase Admin initialized successfully!");

const app = express();
const port = 3000;
let usersCollection;
let requestCollection;


app.use(cors({
  origin: ["http://localhost:5173"],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());


const verifyJWT = (req, res, next) => {
  const token = req.cookies?.token;
  console.log("verifyJWT token:", token); 

  if (!token) {
    console.log("No token found"); 
    return res.status(401).send({ message: "Unauthorized" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log("JWT verification error:", err); 
      return res.status(403).send({ message: "Forbidden" });
    }
    console.log("JWT verified, decoded:", decoded); 
    req.decoded = decoded;
    next();
  });
};




app.post("/jwt", async (req, res) => {
    const { email } = req.body;
    try {
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });

      const token = jwt.sign(
        { email, role: user.role },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "7d" }
      );

      
      res.cookie("token", token, {
        httpOnly: true,
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60 * 1000 
      });

      res.send({ message: "JWT set in cookie" }); 
    } catch (err) {
      console.error(err);
      res.status(500).send({ message: "Failed to create token" });
    }
});


app.get("/users/role/:email", verifyJWT, async (req, res) => {
  const email = req.params.email;
  if (req.decoded.email !== email) return res.status(403).send({ message: "Forbidden" });

  try {
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).send({ message: "User not found" });

    res.send({ role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch user role" });
  }
});

app.post("/users", async (req, res) => {
  const { email, name, uid } = req.body;
  try {
    const exists = await usersCollection.findOne({ email });
    if (exists) return res.send({ message: "User already exists" });

    const result = await usersCollection.insertOne({
      email,
      name,
      uid,
      role: "user", 
      createdAt: new Date(),
    });

    res.send({ message: "User created", userId: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to save user" });
  }
});

app.get("/users", verifyJWT, async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.send(users);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to fetch users" });
  }
});

app.put("/users/role/:id", verifyJWT, async (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;
  try {
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { role } }
    );
    res.send({ message: "User role updated" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to update role" });
  }
});


app.patch("/role-request/:id", verifyJWT, async (req, res) => {
  const requestId = req.params.id;
  const { requestStatus } = req.body;
  try {
    await requestCollection.updateOne(
      { _id: new ObjectId(requestId) },
      { $set: { requestStatus } }
    );
    res.send({ message: "Request status updated" });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to update request" });
  }
});



const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

     db = client.db("localchef-db")
    const mealsCollection = db.collection("meals");
    const chefsCollection = db.collection("chefs");
    const categoriesCollection = db.collection("categories");
    const reviewsCollection = db.collection("reviews");
    const ordersCollection = db.collection("orders");
    const favoritesCollection = db.collection("favorites"); 
    const paymentsCollection = db.collection("payments");
    usersCollection = db.collection("users");
    requestCollection = db.collection("request");
  

   



    
    app.post('/orders', async (req, res) => {
      try {
        const order = req.body;
        const requiredFields = ['mealName', 'price', 'quantity', 'chefId', 'userEmail', 'userAddress'];
        for (const field of requiredFields) {
          if (!order[field]) return res.status(400).send({ message: `${field} is required` });
        }

        order.orderStatus = "pending";
        order.orderTime = new Date();
        order.paymentStatus = "Pending";

        const result = await ordersCollection.insertOne(order);
        res.status(201).send({ message: 'Order placed successfully!', orderId: result.insertedId });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to place order' });
      }
    });


    app.post("/create-checkout-session", async (req, res) => {
      const { orderId, mealName, price } = req.body;

      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: { name: mealName },
                unit_amount: price * 100,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${process.env.site_domain}/dashboard/payment-success?orderId=${orderId}&amount=${price}&transactionId={CHECKOUT_SESSION_ID}`,
cancel_url: `${process.env.site_domain}/dashboard/orders`,
        });

        res.send({ url: session.url });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to create checkout session" });
      }
    });

app.post("/payments", async (req, res) => {
  try {
    const payment = req.body;
    if (!payment.orderId) return res.status(400).send({ message: "orderId is required" });

    payment.paymentTime = new Date();
    const result = await paymentsCollection.insertOne(payment);

    await ordersCollection.updateOne(
      { _id: new ObjectId(payment.orderId) },
      { $set: { paymentStatus: "Paid" } }
    );

    res.send({ message: "Payment recorded successfully", paymentId: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to save payment" });
  }
});

    app.get('/orders', async (req, res) => {
  try {
    const { chefId } = req.query;
    let query = { orderStatus: { $in: ["pending", "accepted"] } };

    if (chefId) query.chefId = chefId;

    const orders = await ordersCollection.find(query).toArray();
    res.send(orders);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: 'Failed to fetch orders' });
  }
});

 
    app.patch('/orders/:id/status', async (req, res) => {
  try {
    const orderId = req.params.id;
    const { orderStatus } = req.body;

    
    const allowedStatuses = ["accepted", "rejected", "delivered"];
    if (!allowedStatuses.includes(orderStatus)) {
      return res.status(400).send({ message: "Invalid order status" });
    }

  
    const order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });
    if (!order) return res.status(404).send({ message: "Order not found" });

    
    if (orderStatus === "accepted" || orderStatus === "rejected") {
      if (order.orderStatus !== "pending") {
        return res.status(400).send({ message: "Only pending orders can be accepted or rejected" });
      }
    } else if (orderStatus === "delivered") {
      if (order.orderStatus !== "accepted") {
        return res.status(400).send({ message: "Only accepted orders can be delivered" });
      }
    }

    
    await ordersCollection.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { orderStatus } }
    );

    res.send({ message: `Order status updated to ${orderStatus}` });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to update order status" });
  }
});

    
    app.delete('/orders/:id', async (req, res) => {
      try {
        const result = await ordersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) return res.status(404).send({ message: "Order not found" });
        res.send({ message: "Order deleted successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to delete order" });
      }
    });

    
    app.get('/categories', async (req, res) => {
      try { const categories = await categoriesCollection.find().toArray(); res.send(categories); }
      catch (err) { res.status(500).send({ message: 'Failed to fetch categories' }); }
    });

    app.get('/chefs', async (req, res) => {
      try { const chefs = await chefsCollection.find().toArray(); res.send(chefs); }
      catch (err) { res.status(500).send({ message: 'Failed to fetch chefs' }); }
    });

    app.get('/meals', async (req, res) => {
      try { const meals = await mealsCollection.find().toArray(); res.send(meals); }
      catch (err) { res.status(500).send({ message: 'Failed to fetch meals' }); }
    });

    app.get('/meals/:id', async (req, res) => {
      try {
        const meal = await mealsCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!meal) return res.status(404).send({ message: 'Meal not found' });
        res.send(meal);
      } catch (err) { res.status(500).send({ message: 'Failed to fetch meal' }); }
    });

    app.post('/meals', async (req, res) => {
      try {
        const meal = req.body;
        const requiredFields = ["name","category","price","chef","image","chefId","deliveryArea","estimatedDeliveryTime","ingredients"];
        for (const field of requiredFields) if (!meal[field]) return res.status(400).send({ message: `${field} is required` });
        const result = await mealsCollection.insertOne(meal);
        res.status(201).send({ message: "Meal created successfully!", mealId: result.insertedId });
      } catch (err) { res.status(500).send({ message: "Failed to create meal" }); }
    });

    app.get('/reviews', async (req, res) => {
      try { const reviews = await reviewsCollection.find().toArray(); res.send(reviews); }
      catch (err) { res.status(500).send({ message: 'Failed to fetch reviews' }); }
    });

    app.post('/reviews', async (req, res) => {
      try {
        const review = req.body;
        const requiredFields = ['foodId','reviewerName','reviewerImage','rating','comment'];
        for (const field of requiredFields) if (!review[field]) return res.status(400).send({ message: `${field} is required` });
        review.date = new Date().toISOString();
        const result = await reviewsCollection.insertOne(review);
        res.status(201).send({ message: 'Review submitted successfully!', reviewId: result.insertedId });
      } catch (err) { res.status(500).send({ message: 'Failed to submit review' }); }
    });

    app.delete('/reviews/:id', async (req, res) => {
      try {
        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) return res.status(404).send({ message: "Review not found" });
        res.send({ message: "Review deleted successfully" });
      } catch (err) { res.status(500).send({ message: "Failed to delete review" }); }
    });

   
    app.get('/favorites', async (req, res) => {
      try { const favorites = await favoritesCollection.find().toArray(); res.send(favorites); }
      catch (err) { res.status(500).send({ message: 'Failed to fetch favorites' }); }
    });

    app.post('/favorites', async (req, res) => {
      try {
        const fav = req.body;
        const requiredFields = ['userEmail','mealId','mealName','chefId','chefName','price','image'];
        for (const field of requiredFields) if (!fav[field]) return res.status(400).send({ message: `${field} is required` });

        const exists = await favoritesCollection.findOne({ userEmail: fav.userEmail, mealId: fav.mealId });
        if (exists) return res.status(200).send({ message: 'Meal already in favorites' });

        fav.addedTime = new Date().toISOString();
        const result = await favoritesCollection.insertOne(fav);
        res.status(201).send({ message: 'Meal added to favorites', favoriteId: result.insertedId });
      } catch (err) { res.status(500).send({ message: 'Failed to add favorite' }); }
    });

    

    
    app.post('/role-request', async (req, res) => {
      try {
        const { userId, userName, userEmail, requestType } = req.body;
        if (!userId || !userName || !userEmail || !requestType) return res.status(400).send({ message: 'All fields are required' });

        const requestData = { userId, userName, userEmail, requestType, requestStatus: "pending", requestTime: new Date().toISOString() };
        const result = await requestCollection.insertOne(requestData);
        res.status(201).send({ message: 'Request submitted successfully!', requestId: result.insertedId });
      } catch (err) { res.status(500).send({ message: 'Failed to submit request' }); }
    });


    app.patch('/role-request/:id', verifyJWT, async (req, res) => {
      const requestId = req.params.id;
      const { action } = req.body; 

      try {
        const request = await requestCollection.findOne({ _id: new ObjectId(requestId) });
        if (!request) return res.status(404).send({ message: "Request not found" });

        if (action === "accept") {
          
          await usersCollection.updateOne(
            { _id: new ObjectId(request.userId) },
            { $set: { role: request.requestType } }
          );
          await requestCollection.updateOne(
            { _id: new ObjectId(requestId) },
            { $set: { requestStatus: "accepted" } }
          );
          res.send({ message: `Request accepted, role updated to ${request.requestType}` });
        } else if (action === "reject") {
          await requestCollection.updateOne(
            { _id: new ObjectId(requestId) },
            { $set: { requestStatus: "rejected" } }
          );
          res.send({ message: "Request rejected" });
        } else {
          res.status(400).send({ message: "Invalid action" });
        }
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to process request" });
      }
    });

   
    app.get('/role-requests', verifyJWT, async (req, res) => {
      try {
        const requests = await requestCollection.find().toArray();
        res.send(requests);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to fetch requests" });
      }
    });


    app.get("/statistics", verifyJWT, async (req, res) => {
  try {
    if (!db) {
      console.log("DB is not connected yet");
      return res.status(500).json({ message: "Database not connected" });
    }

    const payments = db.collection("payments");
    console.log("Payments collection ready");

    const totalPaymentAgg = await payments.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]).toArray();
    console.log("Total payments aggregation:", totalPaymentAgg);

    const totalPayments = totalPaymentAgg[0]?.total || 0;

    const users = db.collection("users");
    const totalUsers = await users.countDocuments();
    console.log("Total users:", totalUsers);

    const orders = db.collection("orders");
    const ordersPending = await orders.countDocuments({ orderStatus: "pending" });
    const ordersDelivered = await orders.countDocuments({ orderStatus: "delivered" });
    console.log("Orders pending:", ordersPending, "Orders delivered:", ordersDelivered);

    res.json({ totalPayments, totalUsers, ordersPending, ordersDelivered });
  } catch (err) {
    console.error("Error fetching statistics:", err);
    res.status(500).json({ message: "Failed to fetch statistics." });
  }
});




   // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged MongoDB successfully!");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Server is Running!'));
app.get('/hello', (req, res) => res.send('How are you?'));

app.listen(port, () => console.log(`Server is listening on port ${port}`));
