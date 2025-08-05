import mongoose from "mongoose";
import ApiError from "../utils/ApiError.js";

const errorHandler = (err, req, res, next) => {
  let error = err;
  if (typeof ApiError !== 'function') {
    console.error("ApiError is not a constructor:", ApiError);
  }

  const mongooseErrors = [
    mongoose.Error.ValidationError,
    mongoose.Error.CastError,
    mongoose.Error.DocumentNotFoundError,
    mongoose.Error.DisconnectedError,
    mongoose.Error.DivergentArrayError,
    mongoose.Error.MissingSchemaError,
    mongoose.Error.ObjectExpectedError,
    mongoose.Error.OverwriteModelError,
    mongoose.Error.ParallelSaveError,
    mongoose.Error.StrictModeError,
    mongoose.Error.VersionError,
  ];

  const isMongooseError = mongooseErrors.some(
    (errClass) => typeof errClass === "function" && error instanceof errClass
  );

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || (isMongooseError ? 400 : 500);
    const message = error.message || "Something Went Wrong";

    error = new ApiError(statusCode, message, error?.errors || [], err.stack);
  }

  const response = {
    success: false,
    message: error.message,
    statusCode: error.statusCode,
  };

  if (process.env.NODE_ENV === "development") {
    response.stack = error.stack;
    response.errors = error.errors || [];
  }

  return res.status(error.statusCode).json(response);
};

export { errorHandler };
