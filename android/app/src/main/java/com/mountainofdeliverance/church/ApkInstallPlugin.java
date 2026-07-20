package com.mountainofdeliverance.church;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "ApkInstall")
public class ApkInstallPlugin extends Plugin {

    private static final int REQUEST_INSTALL_PERMISSION = 1001;

    @PluginMethod
    public void install(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("filePath is required");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        // On Android 8+ (Oreo), we need the InstallUnknownApps permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!activity.getPackageManager().canRequestPackageInstalls()) {
                // Request the permission
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + activity.getPackageName()));
                startActivityForResult(call, intent, REQUEST_INSTALL_PERMISSION);
                return;
            }
        }

        performInstall(activity, filePath, call);
    }

    private void performInstall(Activity activity, String filePath, PluginCall call) {
        try {
            File apkFile = new File(filePath);
            Uri apkUri;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                // Use FileProvider for Android 7+
                String authority = activity.getPackageName() + ".fileprovider";
                apkUri = FileProvider.getUriForFile(activity, authority, apkFile);
            } else {
                apkUri = Uri.fromFile(apkFile);
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            activity.startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No activity found to handle APK installation: " + e.getMessage());
        } catch (Exception e) {
            call.reject("Failed to install APK: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_INSTALL_PERMISSION) {
            PluginCall savedCall = getSavedCall();
            if (savedCall != null) {
                Activity activity = getActivity();
                if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (activity.getPackageManager().canRequestPackageInstalls()) {
                        String filePath = savedCall.getString("filePath");
                        if (filePath != null) {
                            performInstall(activity, filePath, savedCall);
                            return;
                        }
                    }
                }
                savedCall.reject("Install unknown apps permission not granted");
            }
        }
    }
}
