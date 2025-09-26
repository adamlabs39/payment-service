const errorResponse = (message, errors) => {
  let response = {
    message,
  };
  if (errors) response.errors = errors;
  return response;
};

export default errorResponse;
