import NotfoundException from "../exceptions/notfound-exception.js";
import UnauthorizedException from "../exceptions/unauthorized-exception.js";
import errorResponse from "../responses/error-response.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import DuplicateException from "../exceptions/duplicate-exception.js";
import {UniqueConstraintError} from "sequelize";
import {ZodError} from "zod";
import zodErrorParser from "../helpers/zod-error-parser.js";

const errorMiddleware = (error, request, response, nextFunction) => {
  console.error("Error Middleware", error);
  if (error instanceof NotfoundException) {
    return response.status(error.code).json(errorResponse(error.message));
  }else if(error instanceof UnauthorizedException){
    return response.status(error.code).json(errorResponse(error.message));
  }
  else if(error instanceof BadRequestException){
    response.status(error.status).json(errorResponse("Bad Request", error.errors));
  }
  else if(error instanceof DuplicateException){
    response.status(error.code).json(errorResponse(error.message, error.errors));
  }
  else if(error instanceof UniqueConstraintError){
    response.status(400).json(errorResponse("Duplicate Data", error.errors));
  }
  else if( error instanceof ZodError){
    response.status(400).json(errorResponse("Validation Error", zodErrorParser(error.errors)));
  }else{
    response.status(500).json(errorResponse(error.message))
  }
};

export default errorMiddleware;