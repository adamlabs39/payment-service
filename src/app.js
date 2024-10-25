import express from "express";
import errorMiddleware from "./middlewares/error-middleware.js";
import 'dotenv/config';
import morgan from 'morgan';
import helmet from "helmet";
import { rateLimit } from 'express-rate-limit';
import cors from 'cors';
import MODEL_MERGE from "./models/model-merge.js";
import DBSeeder from "./seeders/db-seeder.js";

const app = express();
const port = process.env.APP_PORT || 8080;
const host = process.env.APP_HOST || 'localhost';
const logger = morgan('dev');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);
app.use(helmet());

const corsConfig = {
    origin: "*", // In production, restrict this to specific domains
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 204
};
app.use(cors(corsConfig));
const limiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 100,
    message: "Too many requests from this IP, please try again after 5 minutes"
});
app.use(limiter);
app.use(errorMiddleware);


if (process.env.SYNC_DB === "true") {
    try {
        for (const model of MODEL_MERGE) {
            await model.sync({ alter: true, force: true });
        }
        await DBSeeder();
    } catch (error) {
        console.error("Failed to synchronize the database:", error);
    }
}
app.listen(port, host, async () => {
    console.log(`Server running on http://${host}:${port}`);
});
