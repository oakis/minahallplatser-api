const handleError = (e) => {
    return new Promise((resolve, reject) => {
        switch (e.code) {
            case 'EAI_AGAIN':
                resolve();
                break;
            default:
                reject(e);
                break;
        }
    });

}

module.exports = handleError;