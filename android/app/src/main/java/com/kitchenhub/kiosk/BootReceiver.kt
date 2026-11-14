package com.kitchenhub.kiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Opens the kiosk after boot. Android 10 may block this; the Home role is the reliable path. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) {
            return
        }
        val start = Intent(context, MainActivity::class.java)
        start.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(start)
        } catch (err: RuntimeException) {
            Log.e("KitchenKiosk", "boot start failed", err)
        }
    }
}
