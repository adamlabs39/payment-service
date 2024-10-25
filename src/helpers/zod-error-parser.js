const zodErrorParser = (zodError) => {
  return zodError.map(error => {
    return {
        field: error.path[error.path.length -1],
        message: error.message
    }
  });
};

export default zodErrorParser;
