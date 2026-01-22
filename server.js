const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const LICENSES_FILE = path.join(__dirname, 'licenses.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Helper functions
function generateLicenseKey(customerId) {
  const randomSuffix = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `VET-${customerId}-${randomSuffix}`;
}

function loadLicenses() {
  try {
    if (fs.existsSync(LICENSES_FILE)) {
      const data = fs.readFileSync(LICENSES_FILE, 'utf-8');
      const entries = JSON.parse(data);
      const licenses = {};
      entries.forEach(([hash, license]) => {
        licenses[hash] = license;
      });
      return licenses;
    }
  } catch (err) {
    console.error('Error loading licenses:', err);
  }
  return {};
}

function saveLicenses(licenses) {
  try {
    const entries = Object.entries(licenses).map(([hash, license]) => [hash, license]);
    fs.writeFileSync(LICENSES_FILE, JSON.stringify(entries, null, 2));
  } catch (err) {
    console.error('Error saving licenses:', err);
  }
}

function hashLicense(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Load licenses on startup
let licenses = loadLicenses();

// API Routes

// Get all licenses
app.get('/api/licenses', (req, res) => {
  try {
    const licensesList = Object.entries(licenses).map(([hash, license]) => ({
      hash,
      ...license
    }));
    res.json(licensesList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// الحصول على معلومات رخصة محددة
app.get('/api/licenses/:hash', (req, res) => {
  try {
    const { hash } = req.params;
    const license = licenses[hash];

    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    res.json({
      hash,
      ...license
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get license statistics
app.get('/api/stats', (req, res) => {
  try {
    const now = new Date();
    const stats = {
      total: Object.keys(licenses).length,
      active: 0,
      inactive: 0,
      expired: 0,
      expiringIn30Days: 0,
      timeToResolve: '0h'
    };

    Object.values(licenses).forEach(license => {
      const expirationDate = new Date(license.expirationDate);
      const daysUntilExpiry = (expirationDate - now) / (1000 * 60 * 60 * 24);

      if (daysUntilExpiry < 0) {
        stats.expired++;
      } else if (daysUntilExpiry <= 30) {
        stats.expiringIn30Days++;
      }

      if (license.isActive) {
        stats.active++;
      } else {
        stats.inactive++;
      }
    });

    stats.available = stats.total - stats.active;
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new license
app.post('/api/licenses', (req, res) => {
  try {
    const { customerId, type = 'production', validityDays = 365 } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const licenseKey = generateLicenseKey(customerId);
    const hash = hashLicense(licenseKey);
    const now = new Date();
    const expirationDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    const license = {
      key: licenseKey,
      customerId,
      type,
      created: now.toISOString(),
      expirationDate: expirationDate.toISOString(),
      validityDays,
      deviceFingerprint: null,
      usageCount: 0,
      isActive: true
    };

    licenses[hash] = license;
    saveLicenses(licenses);

    res.status(201).json({
      success: true,
      message: 'License created successfully',
      license: { hash, ...license }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate license
app.post('/api/licenses/validate', (req, res) => {
  try {
    const { licenseKey } = req.body;

    if (!licenseKey) {
      return res.status(400).json({ valid: false, reason: 'License key not provided' });
    }

    const hash = hashLicense(licenseKey);
    const license = licenses[hash];

    if (!license) {
      return res.json({ valid: false, reason: 'License not found' });
    }

    const now = new Date();
    const expirationDate = new Date(license.expirationDate);

    if (expirationDate < now) {
      return res.json({ valid: false, reason: 'License expired' });
    }

    if (!license.isActive) {
      return res.json({ valid: false, reason: 'License is inactive' });
    }

    license.usageCount++;
    saveLicenses(licenses);

    res.json({
      valid: true,
      customerId: license.customerId,
      expirationDate: license.expirationDate,
      type: license.type
    });
  } catch (err) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// API لربط المستخدمين بالرخصة والتحكم فيهم
// إضافة مستخدمين لرخصة معينة
app.post('/api/licenses/:hash/users', (req, res) => {
  try {
    const { hash } = req.params;
    const { username, role = 'user' } = req.body;

    const license = licenses[hash];
    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    if (!license.users) {
      license.users = [];
    }

    // تحقق من عدم تكرار المستخدم
    if (license.users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'User already exists in this license' });
    }

    license.users.push({
      username,
      role,
      addedAt: new Date().toISOString(),
      isActive: true
    });

    saveLicenses(licenses);

    res.status(201).json({
      success: true,
      message: 'User added to license',
      user: license.users[license.users.length - 1]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// الحصول على مستخدمي رخصة
app.get('/api/licenses/:hash/users', (req, res) => {
  try {
    const { hash } = req.params;
    const license = licenses[hash];

    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    res.json({
      licenseKey: license.key,
      customerId: license.customerId,
      users: license.users || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تعطيل/تفعيل مستخدم في رخصة
app.put('/api/licenses/:hash/users/:username', (req, res) => {
  try {
    const { hash, username } = req.params;
    const { isActive } = req.body;

    const license = licenses[hash];
    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    if (!license.users) {
      return res.status(404).json({ error: 'Users not found' });
    }

    const user = license.users.find(u => u.username === username);
    if (!user) {
      return res.status(404).json({ error: 'User not found in license' });
    }

    user.isActive = isActive;
    saveLicenses(licenses);

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'}`,
      user
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حذف مستخدم من رخصة
app.delete('/api/licenses/:hash/users/:username', (req, res) => {
  try {
    const { hash, username } = req.params;

    const license = licenses[hash];
    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    if (!license.users) {
      return res.status(404).json({ error: 'Users not found' });
    }

    const userIndex = license.users.findIndex(u => u.username === username);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found in license' });
    }

    license.users.splice(userIndex, 1);
    saveLicenses(licenses);

    res.json({ success: true, message: 'User removed from license' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API للتحقق من بيانات المستخدم والرخصة
app.post('/api/verify-license', (req, res) => {
  try {
    const { licenseKey, deviceId } = req.body;

    if (!licenseKey || !deviceId) {
      return res.status(400).json({
        valid: false,
        reason: 'License key and device ID are required'
      });
    }

    console.log(`\n🔍 التحقق من الرخصة:`);
    console.log(`   الرخصة: ${licenseKey.substring(0, 10)}...`);
    console.log(`   الجهاز: ${deviceId}`);

    const hash = hashLicense(licenseKey);
    const license = licenses[hash];

    if (!license) {
      console.log(`❌ الرخصة غير موجودة`);
      return res.json({
        valid: false,
        reason: 'License not found'
      });
    }

    console.log(`✅ الرخصة موجودة`);

    // التحقق من انتهاء الرخصة
    const now = new Date();
    const expirationDate = new Date(license.expirationDate);
    if (expirationDate < now) {
      console.log(`❌ الرخصة منتهية الصلاحية`);
      return res.json({
        valid: false,
        reason: 'License expired'
      });
    }

    console.log(`✅ الرخصة سارية`);

    // التحقق من تفعيل الرخصة
    if (!license.isActive) {
      console.log(`❌ الرخصة معطلة`);
      return res.json({
        valid: false,
        reason: 'License is inactive'
      });
    }

    console.log(`✅ الرخصة مفعلة`);

    // تحديث معرّف الجهاز المرتبط بالرخصة
    if (!license.boundDeviceId) {
      license.boundDeviceId = deviceId;
      console.log(`🆔 ربط الرخصة بالجهاز: ${deviceId}`);
    } else if (license.boundDeviceId !== deviceId) {
      console.log(`❌ الرخصة مرتبطة بجهاز مختلف: ${license.boundDeviceId}`);
      return res.json({
        valid: false,
        reason: 'License is bound to a different device'
      });
    }

    console.log(`✅ تم التحقق بنجاح`);
    
    // حفظ التحديثات
    saveLicenses(licenses);

    return res.json({
      valid: true,
      licenseName: license.name || 'VetCare License',
      expirationDate: license.expirationDate,
      boundDeviceId: license.boundDeviceId,
      remainingDays: Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24))
    });
  } catch (error) {
    console.error('❌ License verification error:', error);
    res.status(500).json({
      valid: false,
      reason: 'Internal server error'
    });
  }
});

app.post('/api/verify-user-license', (req, res) => {
  try {
    const { username, licenseKey } = req.body;

    if (!username || !licenseKey) {
      return res.status(400).json({
        valid: false,
        reason: 'Username and license key are required'
      });
    }

    const hash = hashLicense(licenseKey);
    const license = licenses[hash];

    if (!license) {
      return res.json({
        valid: false,
        reason: 'License not found'
      });
    }

    // التحقق من انتهاء الرخصة
    const now = new Date();
    const expirationDate = new Date(license.expirationDate);
    if (expirationDate < now) {
      return res.json({
        valid: false,
        reason: 'License expired'
      });
    }

    // التحقق من تفعيل الرخصة
    if (!license.isActive) {
      return res.json({
        valid: false,
        reason: 'License is inactive'
      });
    }

    // التحقق من وجود المستخدم في الرخصة
    if (!license.users || license.users.length === 0) {
      return res.json({
        valid: false,
        reason: 'No users assigned to this license'
      });
    }

    const user = license.users.find(u => u.username === username);
    if (!user) {
      return res.json({
        valid: false,
        reason: 'User not assigned to this license'
      });
    }

    if (!user.isActive) {
      return res.json({
        valid: false,
        reason: 'User is deactivated'
      });
    }

    // تسجيل محاولة الدخول
    if (!license.loginHistory) {
      license.loginHistory = [];
    }
    license.loginHistory.push({
      username,
      timestamp: new Date().toISOString(),
      success: true
    });

    // الحفاظ على آخر 100 محاولة فقط
    if (license.loginHistory.length > 100) {
      license.loginHistory = license.loginHistory.slice(-100);
    }

    license.usageCount++;
    saveLicenses(licenses);

    res.json({
      valid: true,
      customerId: license.customerId,
      expirationDate: license.expirationDate,
      type: license.type,
      user: {
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// Deactivate license
app.put('/api/licenses/:hash/deactivate', (req, res) => {
  try {
    const { hash } = req.params;
    const license = licenses[hash];

    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    license.isActive = false;
    saveLicenses(licenses);

    console.log(`🔴 تم تعطيل الرخصة: ${license.key}`);
    res.json({ success: true, message: 'License deactivated', license: { hash, ...license } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activate license
app.put('/api/licenses/:hash/activate', (req, res) => {
  try {
    const { hash } = req.params;
    const license = licenses[hash];

    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    license.isActive = true;
    saveLicenses(licenses);

    console.log(`🟢 تم تفعيل الرخصة: ${license.key}`);
    res.json({ success: true, message: 'License activated', license: { hash, ...license } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Extend license validity
app.put('/api/licenses/:hash/extend', (req, res) => {
  try {
    const { hash } = req.params;
    const { daysToAdd } = req.body;

    if (!hash || !daysToAdd || daysToAdd <= 0) {
      return res.status(400).json({ error: 'License hash and positive daysToAdd are required' });
    }

    const license = licenses[hash];

    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    const currentExpiry = new Date(license.expirationDate);
    const newExpiry = new Date(currentExpiry.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    license.expirationDate = newExpiry.toISOString();
    license.validityDays += daysToAdd;
    saveLicenses(licenses);

    console.log(`⏰ تم تمديد الرخصة: ${license.key} بـ ${daysToAdd} أيام`);
    console.log(`   تاريخ الانتهاء الجديد: ${newExpiry.toLocaleDateString('ar-SA')}`);

    res.json({
      success: true,
      message: `License extended by ${daysToAdd} days`,
      license: { hash, ...license }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete license
app.delete('/api/licenses/:hash', (req, res) => {
  try {
    const { hash } = req.params;

    if (!licenses[hash]) {
      return res.status(404).json({ error: 'License not found' });
    }

    delete licenses[hash];
    saveLicenses(licenses);

    res.json({ success: true, message: 'License deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   VetCare License Server Started       ║
║   Listening on port ${PORT}             ║
║   Dashboard: http://localhost:${PORT}   ║
╚════════════════════════════════════════╝
  `);
});
