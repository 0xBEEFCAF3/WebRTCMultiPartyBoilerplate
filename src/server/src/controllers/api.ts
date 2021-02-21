"use strict";

import { Response, Request, NextFunction } from "express";

/**
 * List of API examples.
 * @route GET /api
 */
export const getApi = (req: Request, res: Response) => {
    console.log('PONG');
    res.status(200).send();
};
