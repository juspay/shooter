# WORKING SHOOTER NOTIFICATION CONFIGURATION

## ✅ CONFIRMED WORKING SETUP (2025-08-09)

This configuration successfully delivers Shooter notifications from local development server to iOS device.

### Local Server Configuration

- **Server URL**: `http://YOUR_LOCAL_IP:5173` (Mac's local IP address)
- **Server Command**: `npm run dev -- --host` (enables network access)
- **APNs Mode**: `production: false` (sandbox/development mode)
- **APNs Key ID**: `YOUR_KEY_ID` (new key after security incident)
- **API Key**: `YOUR_API_KEY`

### iOS App Configuration

- **Server URL**: `http://YOUR_LOCAL_IP:5173`
- **API Key**: `YOUR_API_KEY` (hardcoded default)
- **APNs Environment**: Development (provisioning profile overrides entitlements)
- **Device Token**: `YOUR_64_CHAR_HEX_DEVICE_TOKEN`

### Network Configuration

- **Mac IP**: `YOUR_LOCAL_IP` (Wi-Fi network)
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
- Original key `REVOKED_KEY_ID` was revoked after accidental commit
- New key `YOUR_KEY_ID` must never be committed

### Test Command

```bash
curl -X POST "http://YOUR_LOCAL_IP:5173/api/notify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"title": "Test", "message": "Working!"}'
```

### Files Modified

- `ios/Shooter/Shooter/Config.swift` - Server URL to Mac IP
- `ios/Shooter/Shooter/NotificationManager.swift` - Default API key
- `src/lib/server/library-apns.js` - Sandbox mode
- `.env` - Local APNs credentials
