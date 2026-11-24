// Generated from packages/ui-tokens/tokens.json. Do not edit by hand.
// Palette: Nebula Gold. Dark only.

import SwiftUI

public enum StellarTokens {
    public enum Colors {
        public static let bgVoid = Color(.sRGB, red: 0.027, green: 0.024, blue: 0.082, opacity: 1)
        public static let glassFill = Color(.sRGB, red: 0.094, green: 0.078, blue: 0.22, opacity: 0.55)
        public static let glassFillStrong = Color(.sRGB, red: 0.094, green: 0.078, blue: 0.22, opacity: 0.78)
        public static let glassBorder = Color(.sRGB, red: 1, green: 1, blue: 1, opacity: 0.1)
        public static let fillSubtle = Color(.sRGB, red: 1, green: 1, blue: 1, opacity: 0.05)
        public static let fillHover = Color(.sRGB, red: 1, green: 1, blue: 1, opacity: 0.06)
        public static let fillSelected = Color(.sRGB, red: 1, green: 1, blue: 1, opacity: 0.08)
        public static let fillThumb = Color(.sRGB, red: 1, green: 1, blue: 1, opacity: 0.16)
        public static let separator = Color(.sRGB, red: 1, green: 1, blue: 1, opacity: 0.07)
        public static let track = Color(.sRGB, red: 1, green: 1, blue: 1, opacity: 0.1)
        public static let textPrimary = Color(.sRGB, red: 0.961, green: 0.953, blue: 1, opacity: 1)
        public static let textSecondary = Color(.sRGB, red: 0.671, green: 0.651, blue: 0.8, opacity: 1)
        public static let accent = Color(.sRGB, red: 0.965, green: 0.78, blue: 0.431, opacity: 1)
        public static let accentInk = Color(.sRGB, red: 0.102, green: 0.071, blue: 0.024, opacity: 1)
        public static let accentSoft = Color(.sRGB, red: 0.965, green: 0.78, blue: 0.431, opacity: 0.14)
        public static let accentLine = Color(.sRGB, red: 0.965, green: 0.78, blue: 0.431, opacity: 0.35)
        public static let accentGlow = Color(.sRGB, red: 0.965, green: 0.78, blue: 0.431, opacity: 0.45)
        public static let violet = Color(.sRGB, red: 0.616, green: 0.549, blue: 1, opacity: 1)
        public static let nebulaViolet = Color(.sRGB, red: 0.431, green: 0.298, blue: 1, opacity: 0.5)
        public static let nebulaMagenta = Color(.sRGB, red: 0.839, green: 0.282, blue: 0.627, opacity: 0.38)
        public static let nebulaBlue = Color(.sRGB, red: 0.235, green: 0.431, blue: 1, opacity: 0.28)
        public static let core = Color(.sRGB, red: 1, green: 0.839, blue: 0.588, opacity: 0.95)
        public static let warning = Color(.sRGB, red: 1, green: 0.698, blue: 0.478, opacity: 1)
        public static let success = Color(.sRGB, red: 0.486, green: 0.949, blue: 0.69, opacity: 1)
        public static let danger = Color(.sRGB, red: 1, green: 0.478, blue: 0.541, opacity: 1)
    }

    public enum Radius {
        public static let thumb: CGFloat = 8
        public static let chip: CGFloat = 10
        public static let button: CGFloat = 12
        public static let list: CGFloat = 16
        public static let card: CGFloat = 20
        public static let cardLarge: CGFloat = 22
        public static let hero: CGFloat = 28
        public static let tabbar: CGFloat = 30
        public static let full: CGFloat = .infinity
    }

    public enum Space {
        public static let s4: CGFloat = 4
        public static let s8: CGFloat = 8
        public static let s12: CGFloat = 12
        public static let s16: CGFloat = 16
        public static let s20: CGFloat = 20
        public static let s24: CGFloat = 24
        public static let s32: CGFloat = 32
        public static let s40: CGFloat = 40
        public static let s56: CGFloat = 56
        public static let s64: CGFloat = 64
    }

    public enum Layout {
        public static let touchTarget: CGFloat = 44
        public static let pagePaddingPhone: CGFloat = 20
        public static let tabBarHeight: CGFloat = 64
        public static let breakpointTablet: CGFloat = 768
        public static let breakpointDesktop: CGFloat = 1024
    }

    public enum Motion {
        public static let instant: Double = 0.1
        public static let quick: Double = 0.2
        public static let smooth: Double = 0.35
        public static let thumbSpring = Animation.interpolatingSpring(stiffness: 400, damping: 32)
        public static let sheetSpring = Animation.interpolatingSpring(stiffness: 300, damping: 32)
        public static let pressScale: CGFloat = 0.97
    }
}

public struct StellarTextStyle {
    public let size: CGFloat
    public let lineHeight: CGFloat
    public let weight: Font.Weight
    public let tracking: CGFloat
    public let uppercase: Bool

    public var font: Font { .system(size: size, weight: weight) }
}

public extension StellarTextStyle {
    static let largeTitle = StellarTextStyle(size: 34, lineHeight: 41, weight: .bold, tracking: -0.68, uppercase: false)
    static let title1 = StellarTextStyle(size: 28, lineHeight: 34, weight: .bold, tracking: -0.56, uppercase: false)
    static let title2 = StellarTextStyle(size: 22, lineHeight: 28, weight: .semibold, tracking: -0.22, uppercase: false)
    static let title3 = StellarTextStyle(size: 20, lineHeight: 25, weight: .semibold, tracking: -0.2, uppercase: false)
    static let headline = StellarTextStyle(size: 17, lineHeight: 22, weight: .semibold, tracking: 0, uppercase: false)
    static let body = StellarTextStyle(size: 17, lineHeight: 22, weight: .regular, tracking: 0, uppercase: false)
    static let bodyDesktop = StellarTextStyle(size: 15, lineHeight: 20, weight: .regular, tracking: 0, uppercase: false)
    static let subhead = StellarTextStyle(size: 15, lineHeight: 20, weight: .regular, tracking: 0, uppercase: false)
    static let footnote = StellarTextStyle(size: 13, lineHeight: 18, weight: .regular, tracking: 0, uppercase: false)
    static let caption = StellarTextStyle(size: 12, lineHeight: 16, weight: .medium, tracking: 0, uppercase: false)
    static let eyebrow = StellarTextStyle(size: 13, lineHeight: 16, weight: .semibold, tracking: 0.78, uppercase: true)
    static let tab = StellarTextStyle(size: 11, lineHeight: 13, weight: .medium, tracking: 0, uppercase: false)
    static let timer = StellarTextStyle(size: 76, lineHeight: 76, weight: .ultraLight, tracking: -2.28, uppercase: false)
    static let timerBlock = StellarTextStyle(size: 72, lineHeight: 72, weight: .ultraLight, tracking: -2.16, uppercase: false)
}

public extension View {
    /// Applies a Stellar text style: system font, tracking, line spacing, tabular digits.
    func stellarText(_ style: StellarTextStyle) -> some View {
        self.font(style.font.monospacedDigit())
            .tracking(style.tracking)
            .lineSpacing(max(0, style.lineHeight - style.size * 1.2))
            .textCase(style.uppercase ? .uppercase : nil)
    }

    /// Glass surface used for cards, the tab bar and sheets.
    func stellarGlass(cornerRadius: CGFloat = StellarTokens.Radius.card) -> some View {
        self.background(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(StellarTokens.Colors.glassFill)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        )
        .overlay(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(StellarTokens.Colors.glassBorder, lineWidth: 1)
        )
    }
}
