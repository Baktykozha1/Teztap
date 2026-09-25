const { buildStructuredPrices } = require("./prices");

async function parseMarketPrices({ city, businessType, competitors }) {
  return buildStructuredPrices({ city, businessType, competitors });
}

module.exports = {
  parseMarketPrices
};
