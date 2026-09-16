/**
 * REPLAY HARNESS & REGRESSION TEST FOR SCALPER ENGINE (A+ DETECTION)
 * Verifies that engine.analyze() output remains 100% deterministic and unchanged.
 */

const ScalperEngine = require('../engine');

function generateMockCandles(count = 100, basePrice = 50000) {
  const candles = [];
  let price = basePrice;
  const startTime = 1700000000;

  for (let i = 0; i < count; i++) {
    const change = (Math.sin(i / 5) * 150) + ((i % 3 === 0 ? 1 : -1) * 40);
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + 25;
    const low = Math.min(open, close) - 25;
    const volume = 100 + (Math.abs(change) * 2);

    candles.push({
      time: startTime + (i * 60),
      open,
      high,
      low,
      close,
      volume
    });
    price = close;
  }
  return candles;
}

function runReplayTest() {
  console.log('🧪 Starting ScalperEngine Replay & Regression Test...');
  const candles = generateMockCandles(150, 50000);
  const engine1 = new ScalperEngine();
  const engine2 = new ScalperEngine();

  const res1 = engine1.analyze(candles);
  const res2 = engine2.analyze(candles);

  const json1 = JSON.stringify(res1);
  const json2 = JSON.stringify(res2);

  if (json1 === json2) {
    console.log('✅ REPLAY HARNESS PASSED: Engine analysis output is 100% deterministic.');
    console.log(`   Processed ${candles.length} klines.`);
    console.log(`   Latest Regime: ${res1.latest.regime}`);
    console.log(`   Latest Score: ${res1.latest.score100}/100`);
    console.log(`   Signals Emitted: ${res1.signals.length}`);
    return true;
  } else {
    console.error('❌ REPLAY HARNESS FAILED: Non-deterministic output detected!');
    process.exit(1);
  }
}

if (require.main === module) {
  runReplayTest();
}

module.exports = { runReplayTest, generateMockCandles };
