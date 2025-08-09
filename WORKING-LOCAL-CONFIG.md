# WORKING SHOOTER NOTIFICATION CONFIGURATION

## ✅ CONFIRMED WORKING SETUP (2025-08-09)

This configuration successfully delivers Shooter notifications from local development server to iOS device.

### Local Server Configuration
- **Server URL**: `http://192.168.29.141:5173` (Mac's local IP address)
- **Server Command**: `npm run dev -- --host` (enables network access)
- **APNs Mode**: `production: false` (sandbox/development mode)
- **APNs Key ID**: `S85L2ZG5R8` (new key after security incident)
- **API Key**: `shooter2024`

### iOS App Configuration  
- **Server URL**: `http://192.168.29.141:5173`
- **API Key**: `shooter2024` (hardcoded default)
- **APNs Environment**: Development (provisioning profile overrides entitlements)
- **Device Token**: `7a233090669bd391d60247e3d2c183165a85e44204a5a4246dc9c78bf2cda838`

### Network Configuration
- **Mac IP**: `192.168.29.141` (Wi-Fi network)
- **Port**: `5173` (Vite dev server)
- **Protocol**: `HTTP` (local development)
- **Firewall**: Allows connections from iPhone to Mac

### Key Learnings
1. **Localhost doesn't work** - Must use actual IP address for iPhone to reach Mac
2. **APNs environment mismatch fails** - Local server sandbox mode must match iOS development environment
3. **Provisioning profile overrides entitlements** - iOS still uses development APNs despite production entitlements
4. **Network binding required** - Server needs `--host` flag to accept external connections
5. **Device token is environment-specific** - Development tokens only work with sandbox APNs

### Security Notes
- APNs credentials are local only (not committed to git)
- Original key `7G377564AL` was revoked after accidental commit
- New key `S85L2ZG5R8` must never be committed

### Test Command
```bash
curl -X POST "http://192.168.29.141:5173/api/notify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer shooter2024" \
  -d '{"title": "Test", "message": "Working!"}'
```

### Files Modified
- `ios/Shooter/Shooter/Config.swift` - Server URL to Mac IP
- `ios/Shooter/Shooter/NotificationManager.swift` - Default API key
- `src/lib/server/library-apns.js` - Sandbox mode
- `.env` - Local APNs credentials