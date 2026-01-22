#!/usr/bin/env node

/**
 * 🧪 اختبار شامل للسيرفر محلياً
 * تشغيل: node test-server-locally.js
 * 
 * ملاحظة: تأكد من تشغيل السيرفر أولاً بـ `npm start` في ترمينال منفصل
 */

const http = require('http');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

let testsPassed = 0;
let testsFailed = 0;
const SERVER_URL = 'http://localhost:3000';

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SERVER_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : data
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function testResult(title, passed, details = '') {
  if (passed) {
    log(colors.green, `✅ ${title}`);
    testsPassed++;
  } else {
    log(colors.red, `❌ ${title}`);
    if (details) log(colors.yellow, `   ⚠️  ${details}`);
    testsFailed++;
  }
}

async function runTests() {
  log(colors.blue, '\n═══════════════════════════════════════════════════');
  log(colors.blue, '🧪 اختبار السيرفر محلياً');
  log(colors.blue, '═══════════════════════════════════════════════════\n');

  try {
    // اختبار 1: Health Check
    log(colors.yellow, '1️⃣  اختبار Health Check:\n');
    try {
      const health = await makeRequest('GET', '/health');
      testResult('  GET /health', health.status === 200, `Status: ${health.status}`);
      testResult('  الرد يحتوي على status', health.body?.status === 'ok');
    } catch (err) {
      testResult('  الاتصال بالسيرفر', false, `تأكد من تشغيل السيرفر: npm start`);
      log(colors.red, `\n❌ السيرفر غير متاح على ${SERVER_URL}`);
      log(colors.yellow, '💡 الحل: شغل "npm start" في ترمينال منفصل\n');
      return;
    }

    // اختبار 2: جلب الرخص
    log(colors.yellow, '\n2️⃣  اختبار GET /api/licenses:\n');
    try {
      const licenses = await makeRequest('GET', '/api/licenses');
      testResult('  GET /api/licenses', licenses.status === 200);
      testResult('  الرد يحتوي على array', Array.isArray(licenses.body));
      testResult('  توجد رخص', licenses.body?.length > 0, `عدد الرخص: ${licenses.body?.length || 0}`);
      
      if (licenses.body?.length > 0) {
        const firstLicense = licenses.body[0];
        testResult('    الرخصة تحتوي على key', firstLicense.key !== undefined);
        testResult('    الرخصة تحتوي على hash', firstLicense.hash !== undefined);
        testResult('    الرخصة تحتوي على expirationDate', firstLicense.expirationDate !== undefined);
        
        // استخدم أول رخصة للاختبارات التالية
        window.testLicenseKey = firstLicense.key;
      }
    } catch (err) {
      testResult('  GET /api/licenses', false, err.message);
    }

    // اختبار 3: الإحصائيات
    log(colors.yellow, '\n3️⃣  اختبار GET /api/stats:\n');
    try {
      const stats = await makeRequest('GET', '/api/stats');
      testResult('  GET /api/stats', stats.status === 200);
      testResult('    total', stats.body?.total !== undefined);
      testResult('    active', stats.body?.active !== undefined);
      testResult('    expired', stats.body?.expired !== undefined);
    } catch (err) {
      testResult('  GET /api/stats', false, err.message);
    }

    // اختبار 4: التحقق من الرخصة (الأهم)
    log(colors.yellow, '\n4️⃣  اختبار POST /api/verify-license:\n');
    try {
      const licenseKey = 'VET-Dr.Khaled-E22EAA555ADD4DA6';
      const deviceId = 'TEST-LOCAL-12345';
      
      const verify = await makeRequest('POST', '/api/verify-license', {
        licenseKey,
        deviceId
      });
      
      testResult('  POST /api/verify-license', verify.status === 200);
      testResult('    الرد يحتوي على valid', verify.body?.valid !== undefined);
      
      if (verify.body?.valid === true) {
        log(colors.green, '    ✅ الرخصة صحيحة!');
        testResult('      licenseName موجود', verify.body?.licenseName !== undefined);
        testResult('      expirationDate موجود', verify.body?.expirationDate !== undefined);
        testResult('      boundDeviceId موجود', verify.body?.boundDeviceId !== undefined);
      } else {
        log(colors.yellow, `    ⚠️  الرخصة غير صحيحة: ${verify.body?.reason}`);
      }
    } catch (err) {
      testResult('  POST /api/verify-license', false, err.message);
    }

    // اختبار 5: التحقق من مستخدم
    log(colors.yellow, '\n5️⃣  اختبار POST /api/verify-user-license:\n');
    try {
      const verify = await makeRequest('POST', '/api/verify-user-license', {
        username: 'testuser',
        licenseKey: 'VET-Dr.Khaled-E22EAA555ADD4DA6'
      });
      
      testResult('  POST /api/verify-user-license', verify.status === 200);
      testResult('    الرد يحتوي على valid', verify.body?.valid !== undefined);
    } catch (err) {
      testResult('  POST /api/verify-user-license', false, err.message);
    }

    // اختبار 6: إنشاء رخصة جديدة
    log(colors.yellow, '\n6️⃣  اختبار POST /api/licenses (إنشاء رخصة جديدة):\n');
    try {
      const newLicense = await makeRequest('POST', '/api/licenses', {
        customerId: 'Test-User-' + Date.now(),
        type: 'testing',
        validityDays: 30
      });
      
      testResult('  POST /api/licenses', newLicense.status === 201);
      testResult('    الرد يحتوي على success', newLicense.body?.success === true);
      testResult('    الرخصة الجديدة لها key', newLicense.body?.license?.key !== undefined);
    } catch (err) {
      testResult('  POST /api/licenses', false, err.message);
    }

    // اختبار 7: Validate endpoint
    log(colors.yellow, '\n7️⃣  اختبار POST /api/licenses/validate:\n');
    try {
      const validate = await makeRequest('POST', '/api/licenses/validate', {
        licenseKey: 'VET-Dr.Khaled-E22EAA555ADD4DA6'
      });
      
      testResult('  POST /api/licenses/validate', validate.status === 200);
      testResult('    الرد يحتوي على valid', validate.body?.valid !== undefined);
    } catch (err) {
      testResult('  POST /api/licenses/validate', false, err.message);
    }

    // النتيجة النهائية
    log(colors.blue, '\n═══════════════════════════════════════════════════');
    log(colors.blue, '📊 النتيجة النهائية:\n');

    console.log(`${colors.green}✅ نجح: ${testsPassed}${colors.reset}`);
    console.log(`${colors.red}❌ فشل: ${testsFailed}${colors.reset}`);

    if (testsFailed === 0) {
      log(colors.green, '\n🎉 ممتاز! جميع الاختبارات نجحت!');
      log(colors.green, '✨ السيرفر جاهز للرفع على Replit!\n');
      process.exit(0);
    } else {
      log(colors.yellow, '\n⚠️  بعض الاختبارات فشلت. راجع الأخطاء أعلاه.\n');
      process.exit(1);
    }

  } catch (error) {
    log(colors.red, `\n❌ خطأ في الاختبار: ${error.message}\n`);
    process.exit(1);
  }
}

// تشغيل الاختبارات
runTests();
