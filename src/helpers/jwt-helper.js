import jwt from "jsonwebtoken";
import "dotenv/config"
import fs from "fs/promises";

export default class JwtHelper {
    static async verify(token) {
        return jwt.verify(token, await this.#getPublicKey(), { algorithms: "RS256" });
    }

    static async #getPublicKey() {
        return await fs.readFile(`${process.cwd()}//public.key`, 'utf-8');
    }
}