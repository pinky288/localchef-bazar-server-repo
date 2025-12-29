 LocalChefBazaar - Server Side

 Project Purpose
The purpose of this project is to provide a secure and scalable backend system for a local home-cooked meal marketplace. It manages user roles (Admin, Chef, User), handles food order processing, secures data with JWT authentication, and integrates Stripe for safe financial transactions.

Live Server URL
[https://localchef-bazaar-server.vercel.app](https://localchef-bazaar-server.vercel.app)

 Key Features
* **Role-Based Access Control (RBAC):** Separate API routes for Admin, Chef, and Users.
* **JWT Security:** Secure token-based authentication using HTTP-only cookies.
* **Stripe Payment Integration:** Backend support for secure credit card payments.
* **MongoDB Aggregation:** Efficiently calculates platform statistics for the Admin dashboard.
* **Automated Chef Management:** Dynamically generates unique Chef IDs upon account approval.
* **Error Handling:** Global error handling to ensure server stability.

 Used NPM Packages
* `express`: Web framework for handling routes and middleware.
* `mongodb`: Driver to interact with the MongoDB database.
* `jsonwebtoken`: For generating and verifying user authentication tokens.
* `cookie-parser`: Middleware to parse and handle browser cookies.
* `cors`: To manage Cross-Origin Resource Sharing settings.
* `dotenv`: To keep sensitive credentials (DB, Keys) secure via environment variables.
* `stripe`: For processing online payment intents.
* `firebase-admin`: For server-side Firebase user verification.
