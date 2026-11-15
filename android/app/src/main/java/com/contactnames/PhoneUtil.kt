package com.contactnames

/**
 * Phone numbers arrive in many shapes ("+91 98765 43210", "098765-43210").
 * We key every table on a normalized form so the same person is always one row.
 */
object PhoneUtil {

  /** Digits only, reduced to the last 10 digits (ignores country/trunk prefixes). */
  fun normalize(raw: String?): String {
    val digits = (raw ?: "").filter { it.isDigit() }
    if (digits.isEmpty()) return ""
    return if (digits.length > 10) digits.substring(digits.length - 10) else digits
  }
}
