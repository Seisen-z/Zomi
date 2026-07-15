package eu.kanade.tachiyomi.source

import android.content.Context
import eu.kanade.tachiyomi.network.NetworkHelper
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.addSingletonFactory

// Extension code resolves NetworkHelper via `by injectLazy()` against Tachiyomi's real Injekt
// registry (see Trash/app/.../di/AppModule.kt: addSingletonFactory { NetworkHelper(app, get()) }).
// Call this once from the host app (e.g. MainApplication.onCreate) before loading any extension.
fun initSourceApiInjekt(context: Context) {
    Injekt.addSingletonFactory { NetworkHelper(context.applicationContext) }
}
