const successResponse = (message,payload,properties) => {
    let response = {
        message,
    }
    if(payload)response.payload = payload;
    if(properties)response.properties = properties;
    return response;
}
export default successResponse;