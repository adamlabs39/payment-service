import JwtHelper from "../helpers/jwt-helper.js";
import { Context as Ctx } from "./context.js";
import { CTX_AUTHOR } from "../constants/context-constant.js";
const authorizationMiddleware = async (request, response, nextFunction) => {
    try {
        const BEARER_TOKEN = request.get("Authorization");
        if (!BEARER_TOKEN) return response.status(401).json({message: `silakan login terlebih dahulu!`});
        const token = BEARER_TOKEN.split(" ")[1]; 
        const isValid = await JwtHelper.verify(token);
        if (!isValid) return response.status(401).json({message: `token tidak valid!`});
        response.locals.jwtData = isValid;
        Ctx.set(CTX_AUTHOR, isValid);
        nextFunction();
    }catch (error) {
        return response.status(401).json({message: `token tidak valid!`});
    }
}

export default authorizationMiddleware;