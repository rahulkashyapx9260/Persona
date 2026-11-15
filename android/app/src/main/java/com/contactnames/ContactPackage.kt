package com.contactnames

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * Registers [ContactModule]. Extends [BaseReactPackage] rather than
 * implementing [com.facebook.react.ReactPackage] directly, so the module is
 * created lazily on first use instead of at startup.
 */
class ContactPackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == ContactModule.NAME) ContactModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      ContactModule.NAME to
        ReactModuleInfo(
          name = ContactModule.NAME,
          className = ContactModule.NAME,
          canOverrideExistingModule = false,
          needsEagerInit = false,
          isCxxModule = false,
          // A legacy bridge module, reached through the bridgeless interop layer.
          isTurboModule = false,
        ),
    )
  }
}
