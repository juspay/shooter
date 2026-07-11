// ShooterWidgetBundle.swift
//
// Entry point for the widget extension target. Add more widgets (e.g. a
// home-screen WidgetKit widget) to the bundle here as they are built.
//
// Belongs to the WIDGET EXTENSION target only. Requires iOS 16.1+.

import SwiftUI
import WidgetKit

@main
struct ShooterWidgetBundle: WidgetBundle {
    var body: some Widget {
        ShooterHomeWidget()
        ShooterLiveActivity()
    }
}
