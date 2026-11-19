/**
 * Driving License Controller
 * HTTP Adapter: Unpacks incoming Fastify request, delegates to Service, and sends HTTP reply.
 */
// below we are creating a controller and handing it over ther service.
export function createDrivingLicenseController(service){
    // here we are taking ip and user agent because dpdp says "you must prove which device and ip clicked i agree to consent form"
    const getClientMeta = (request) => ({
        ip: request.ip,
        userAgent: request.headers['user-agent'] || null,
    });

    return {
        async verifyDrivingLicense(request,reply){
            const actorId = request.headers['x-actor-id'] || null;
            const clientMeta = getClientMeta(request);
            const providerOverride = request.headers['x-kyc-provider'] || request.body?.provider || null;

            const result = await service.verify({ ...request.body, providerOverride }, actorId, clientMeta);

            return reply.code(200).send(result);
        },
    };
}


// What is request?: When a mobile phone sends data over the internet, Fastify wraps everything into an object called request.