import test from 'node:test';
import assert from 'node:assert/strict';
import {localPremiumAccess} from './local-premium-access.mjs';
test('missing credentials are rejected without contacting verification',async()=>{
 assert.equal(await localPremiumAccess({},()=>{throw Error('Should not fetch');}),null);
});
test('verified entitlements retain expiry and expired responses cannot grant access',async()=>{
 const now=()=>2000000000000;
 const access=await localPremiumAccess({authorization:'Bearer test-valid','x-device-id':'test-device'},async()=>Response.json({ok:true,expiresAt:2000000120000}),now);
 assert.equal(access.expiresAt,2000000120000);
 const expired=await localPremiumAccess({authorization:'Bearer test-expired','x-device-id':'test-device'},async()=>Response.json({ok:true,expiresAt:1999999999999}),now);
 assert.equal(expired,null);
});
