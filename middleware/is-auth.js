const jwt = require('jsonwebtoken');
const { redisConnect } = require('../util/redis');

module.exports = (req, res, next) => {
    const authHeader = req.get('Authorization');
    if (!authHeader) {
      const error = new Error('Not authenticated.');
      error.statusCode = 401;
      throw error;
    }
    const token = authHeader.split(' ')[1];

    let blackListTokens;
    let blacklistTokensArray;
    async function handleAuthorization() {
        try {
            const client = await redisConnect;
            const exists = await client.exists('blacklisttokens');
        
            if (exists !== 1) {
            await client.set('blacklisttokens', '[]');
            }
        
            blackListTokens = await client.get('blacklisttokens');
        
            //console.log(blackListTokens);

            blacklistTokensArray = JSON.parse(blackListTokens);

            if (token in blacklistTokensArray) {
                const error = new Error('Not authenticated.');
                error.statusCode = 401;
                throw error;
            }
        
            let decodedToken;
        
            try {
                decodedToken = jwt.verify(token, 'somesuperprojectsecret');
            } catch(err) {
                err.message = 'Not authenticated.';
                err.statusCode = 401;
                err.errorCode = "auth_err";
                throw err;
            }
            if(!decodedToken) {
                const error = new Error('Not authenticated.');
                error.statusCode = 401;
                throw error;
            }
            req.userId = decodedToken.userId;
            next();

        } catch (err) {
            return next(err);
        }
    }
    // redisConnect
    //     .then(client => {
    //         client.exists('blacklisttokens', function(err, reply) {     
    //             if(reply!=1) {
    //                 client.set('blacklisttokens','[]');
    //             }
    //         });
    //         blackListTokens = client.get('blacklisttokens', function(err, reply) {
    //             console.log(reply);
    //             return reply;
    //         });

    //         console.log(blackListTokens);
    //         blacklistTokensArray = blackListTokens.json();
    //     })
    //     .catch(err => {                    
    //         throw err;
    //     });

    //JSON.parse(blackListTokens);
    
    handleAuthorization().catch(error => {
        // Handle errors here
        console.error(error);
        error.message = 'Not authenticated.';
        error.statusCode = 401;
        error.errorCode = "auth_err";
        return next(error);
    });
}