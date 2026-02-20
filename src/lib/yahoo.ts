import YahooFinance from 'yahoo-finance2';

// yahoo-finance2 v3 requires instantiation
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export default yf;
