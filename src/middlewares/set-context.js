import { JwtUtils } from '@adameds/authorization-sdk/jwt-utils';
import { Context } from './context.js';
import { CTX_AUTHOR } from '../constants/context-constant.js';

/**
 *
 * @param {Request} request
 * @param {Response} response
 * @param {import("express").NextFunction} nextFunction
 */
export function setContext(request, response, nextFunction) {
  try {
    const bearerToken = request.get('Authorization');
    if (!bearerToken) {
      response.status(401).json({
        message: 'Gagal',
        errors: [
          {
            message: 'silakan login terlebih dahulu',
            type: 'unauthorized',
          },
        ],
      });
    }
    const token = bearerToken.substring(7);
    const isVaid = JwtUtils.veryfy(token);
    Context.set(CTX_AUTHOR, isVaid);
    nextFunction();
  } catch (error) {
    nextFunction(error);
  }
}
