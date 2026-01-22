#!/usr/bin/env node

/**
 * اختبار سريع لنظام الرخصة المتكامل
 * Quick Test for License System
 */

const API_BASE_URL = 'http://localhost:3000';

// ألوان للطباعة
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
    test: (msg) => console.log(`\n${colors.cyan}📋 ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`)
};

async function testAPI(method, path, data = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`${API_BASE_URL}${path}`, options);
        const result = await response.json();

        return {
            status: response.status,
            ok: response.ok,
            data: result
        };
    } catch (error) {
        return {
            status: 0,
            ok: false,
            error: error.message
        };
    }
}

async function runTests() {
    console.log(`\n${colors.cyan}╔══════════════════════════════════════╗`);
    console.log(`║  VetCare License System Test Suite     ║`);
    console.log(`║  اختبار نظام الرخصة                   ║`);
    console.log(`╚══════════════════════════════════════╝${colors.reset}\n`);

    let testsPassed = 0;
    let testsFailed = 0;

    // Test 1: Health Check
    log.test('Test 1: Health Check - فحص صحة السيرفر');
    {
        const result = await testAPI('GET', '/health');
        if (result.ok) {
            log.success(`Server is running on ${API_BASE_URL}`);
            testsPassed++;
        } else {
            log.error(`Cannot connect to server. Make sure it's running on ${API_BASE_URL}`);
            testsFailed++;
            return;
        }
    }

    // Test 2: Create License
    log.test('Test 2: Create License - إنشاء رخصة');
    let licenseHash = null;
    let licenseKey = null;
    {
        const result = await testAPI('POST', '/api/licenses', {
            customerId: `test-${Date.now()}`,
            type: 'testing',
            validityDays: 30
        });

        if (result.ok && result.data.success) {
            log.success(`License created successfully`);
            log.info(`License Key: ${result.data.license.key}`);
            licenseHash = result.data.license.hash;
            licenseKey = result.data.license.key;
            testsPassed++;
        } else {
            log.error(`Failed to create license: ${result.data.error}`);
            testsFailed++;
        }
    }

    if (!licenseHash) {
        log.error('Cannot continue without license');
        return;
    }

    // Test 3: Get All Licenses
    log.test('Test 3: Get All Licenses - الحصول على الرخص');
    {
        const result = await testAPI('GET', '/api/licenses');
        if (result.ok && Array.isArray(result.data)) {
            log.success(`Retrieved ${result.data.length} licenses`);
            testsPassed++;
        } else {
            log.error('Failed to get licenses');
            testsFailed++;
        }
    }

    // Test 4: Add User to License
    log.test('Test 4: Add User to License - إضافة مستخدم للرخصة');
    {
        const result = await testAPI('POST', `/api/licenses/${licenseHash}/users`, {
            username: 'ahmed',
            role: 'doctor'
        });

        if (result.ok && result.data.success) {
            log.success(`User 'ahmed' added to license`);
            testsPassed++;
        } else {
            log.error(`Failed to add user: ${result.data.error}`);
            testsFailed++;
        }
    }

    // Test 5: Add Another User
    log.test('Test 5: Add Another User - إضافة مستخدم آخر');
    {
        const result = await testAPI('POST', `/api/licenses/${licenseHash}/users`, {
            username: 'fatima',
            role: 'nurse'
        });

        if (result.ok && result.data.success) {
            log.success(`User 'fatima' added to license`);
            testsPassed++;
        } else {
            log.error(`Failed to add user: ${result.data.error}`);
            testsFailed++;
        }
    }

    // Test 6: Get License Users
    log.test('Test 6: Get License Users - الحصول على مستخدمي الرخصة');
    {
        const result = await testAPI('GET', `/api/licenses/${licenseHash}/users`);
        if (result.ok && Array.isArray(result.data.users)) {
            log.success(`Retrieved ${result.data.users.length} users`);
            result.data.users.forEach(user => {
                log.info(`  - ${user.username} (${user.role}) - ${user.isActive ? 'active' : 'inactive'}`);
            });
            testsPassed++;
        } else {
            log.error('Failed to get users');
            testsFailed++;
        }
    }

    // Test 7: Verify User License
    log.test('Test 7: Verify User License - التحقق من رخصة المستخدم');
    {
        const result = await testAPI('POST', '/api/verify-user-license', {
            username: 'ahmed',
            licenseKey: licenseKey
        });

        if (result.ok && result.data.valid) {
            log.success(`User 'ahmed' verified successfully`);
            log.info(`  - Customer ID: ${result.data.customerId}`);
            log.info(`  - Expiration Date: ${result.data.expirationDate}`);
            log.info(`  - License Type: ${result.data.type}`);
            log.info(`  - User Role: ${result.data.user.role}`);
            testsPassed++;
        } else {
            log.error(`Verification failed: ${result.data.reason}`);
            testsFailed++;
        }
    }

    // Test 8: Deactivate User
    log.test('Test 8: Deactivate User - تعطيل المستخدم');
    {
        const result = await testAPI('PUT', `/api/licenses/${licenseHash}/users/ahmed`, {
            isActive: false
        });

        if (result.ok && result.data.success) {
            log.success(`User 'ahmed' deactivated`);
            testsPassed++;
        } else {
            log.error(`Failed to deactivate user: ${result.data.error}`);
            testsFailed++;
        }
    }

    // Test 9: Verify Deactivated User (Should Fail)
    log.test('Test 9: Verify Deactivated User - التحقق من مستخدم معطل (يجب أن يفشل)');
    {
        const result = await testAPI('POST', '/api/verify-user-license', {
            username: 'ahmed',
            licenseKey: licenseKey
        });

        if (result.ok && !result.data.valid) {
            log.success(`User correctly rejected: ${result.data.reason}`);
            testsPassed++;
        } else {
            log.error('Deactivated user should not be verified');
            testsFailed++;
        }
    }

    // Test 10: Activate User Again
    log.test('Test 10: Activate User Again - تفعيل المستخدم');
    {
        const result = await testAPI('PUT', `/api/licenses/${licenseHash}/users/ahmed`, {
            isActive: true
        });

        if (result.ok && result.data.success) {
            log.success(`User 'ahmed' activated`);
            testsPassed++;
        } else {
            log.error(`Failed to activate user: ${result.data.error}`);
            testsFailed++;
        }
    }

    // Test 11: Delete User
    log.test('Test 11: Delete User - حذف مستخدم');
    {
        const result = await testAPI('DELETE', `/api/licenses/${licenseHash}/users/fatima`);

        if (result.ok && result.data.success) {
            log.success(`User 'fatima' deleted from license`);
            testsPassed++;
        } else {
            log.error(`Failed to delete user: ${result.data.error}`);
            testsFailed++;
        }
    }

    // Test 12: Validate License
    log.test('Test 12: Validate License - التحقق من الرخصة');
    {
        const result = await testAPI('POST', '/api/licenses/validate', {
            licenseKey: licenseKey
        });

        if (result.ok && result.data.valid) {
            log.success(`License validated successfully`);
            testsPassed++;
        } else {
            log.error(`License validation failed: ${result.data.reason}`);
            testsFailed++;
        }
    }

    // Test 13: Deactivate License
    log.test('Test 13: Deactivate License - تعطيل الرخصة');
    {
        const result = await testAPI('PUT', `/api/licenses/${licenseHash}/deactivate`);

        if (result.ok && result.data.success) {
            log.success(`License deactivated`);
            testsPassed++;
        } else {
            log.error(`Failed to deactivate license: ${result.data.error}`);
            testsFailed++;
        }
    }

    // Test 14: Validate Deactivated License (Should Fail)
    log.test('Test 14: Validate Deactivated License - التحقق من رخصة معطلة (يجب أن تفشل)');
    {
        const result = await testAPI('POST', '/api/licenses/validate', {
            licenseKey: licenseKey
        });

        if (result.ok && !result.data.valid) {
            log.success(`Deactivated license correctly rejected`);
            testsPassed++;
        } else {
            log.error('Deactivated license should not be validated');
            testsFailed++;
        }
    }

    // Results
    console.log(`\n${colors.cyan}╔══════════════════════════════════════╗`);
    console.log(`║           Test Results                 ║`);
    console.log(`╚══════════════════════════════════════╝${colors.reset}\n`);

    log.success(`${testsPassed} tests passed`);
    if (testsFailed > 0) {
        log.error(`${testsFailed} tests failed`);
    }

    const total = testsPassed + testsFailed;
    const percentage = total > 0 ? Math.round((testsPassed / total) * 100) : 0;

    console.log(`\n📊 ${colors.cyan}Success Rate: ${percentage}%${colors.reset}\n`);

    if (testsFailed === 0 && testsPassed > 0) {
        console.log(`${colors.green}🎉 All tests passed! Your license system is ready to use.${colors.reset}\n`);
    }
}

// Run Tests
runTests().catch(error => {
    log.error(`Test suite failed: ${error.message}`);
    process.exit(1);
});
