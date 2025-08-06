#!/usr/bin/env node

// Test basic HTTP/2 connectivity to APNs
import http2 from 'http2';

async function testHTTP2Connection() {
    console.log('🔌 Testing HTTP/2 Connection to APNs');
    console.log('===================================');
    
    try {
        console.log('Creating HTTP/2 session...');
        
        const client = http2.connect('https://api.development.push.apple.com:443', {
            timeout: 30000,
            settings: {
                enablePush: false
            }
        });
        
        console.log('HTTP/2 session created');
        
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.log('❌ Connection timeout after 30 seconds');
                client.close();
                reject(new Error('Connection timeout'));
            }, 30000);
            
            client.on('connect', () => {
                console.log('✅ HTTP/2 connected successfully!');
                clearTimeout(timeout);
                
                // Test a simple request
                const headers = {
                    ':method': 'GET',
                    ':path': '/'
                };
                
                const request = client.request(headers);
                
                request.on('response', (responseHeaders) => {
                    console.log('📥 Response Status:', responseHeaders[':status']);
                    console.log('📥 APNs ID:', responseHeaders['apns-id']);
                    
                    if (responseHeaders[':status'] === 405) {
                        console.log('✅ Server responding correctly (405 MethodNotAllowed expected for GET)');
                    }
                });
                
                request.on('data', (chunk) => {
                    console.log('📄 Response:', chunk.toString());
                });
                
                request.on('end', () => {
                    console.log('✅ Request completed successfully');
                    client.close();
                    resolve();
                });
                
                request.on('error', (err) => {
                    console.error('❌ Request error:', err.message);
                    client.close();
                    reject(err);
                });
                
                request.end();
            });
            
            client.on('error', (error) => {
                console.error('❌ HTTP/2 session error:', error.message);
                console.error('Error details:', error);
                clearTimeout(timeout);
                client.close();
                reject(error);
            });
            
            client.on('timeout', () => {
                console.error('❌ HTTP/2 session timeout');
                client.close();
                reject(new Error('Session timeout'));
            });
        });
        
    } catch (error) {
        console.error('💥 Test failed:', error.message);
        throw error;
    }
}

if (process.argv[2] === '--test') {
    testHTTP2Connection()
        .then(() => {
            console.log('\n🎉 HTTP/2 connectivity test PASSED');
            console.log('Network and HTTP/2 are working correctly');
        })
        .catch((error) => {
            console.error('\n💥 HTTP/2 connectivity test FAILED');
            console.error('Issue:', error.message);
        });
} else {
    console.log('Usage: node test-http2-basic.js --test');
}