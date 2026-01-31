#!/usr/bin/env python3
"""
High-quality icon generator for Shooter app
Converts SVG to all required formats and sizes with proper antialiasing
"""

import os
import sys
from pathlib import Path
import subprocess
import json

# Icon size configurations
ICON_CONFIGS = {
    # Web/PWA Icons
    'web': {
        'favicon-16x16.png': 16,
        'favicon-32x32.png': 32,
        'favicon-96x96.png': 96,
        'favicon-192x192.png': 192,
        'favicon-512x512.png': 512,
        'android-chrome-192x192.png': 192,
        'android-chrome-512x512.png': 512,
        'apple-touch-icon.png': 180,
        'mstile-150x150.png': 150,
    },
    
    # Desktop Application Icons  
    'desktop': {
        'shooter.png': 512,
        'shooter-256.png': 256,
        'shooter-tray-16.png': 16,
        'shooter-tray-32.png': 32,
        'shooter-menubar-16.png': 16,
        'shooter-menubar-32.png': 32,
    },
    
    # iOS App Icons (all required sizes)
    'ios': {
        'icon-20.png': 20,          # 20pt
        'icon-29.png': 29,          # 29pt  
        'icon-40.png': 40,          # 40pt
        'icon-58.png': 58,          # 29pt @2x
        'icon-60.png': 60,          # 60pt
        'icon-76.png': 76,          # 76pt
        'icon-80.png': 80,          # 40pt @2x
        'icon-87.png': 87,          # 29pt @3x
        'icon-120.png': 120,        # 60pt @2x
        'icon-152.png': 152,        # 76pt @2x
        'icon-167.png': 167,        # 83.5pt @2x
        'icon-180.png': 180,        # 60pt @3x
        'icon-1024.png': 1024,      # App Store
    },
    
    # Social Media Icons
    'social': {
        'shooter-social-180x180.png': 180,
        'shooter-social-400x400.png': 400,
        'shooter-social-500x500.png': 500,
        'shooter-logo-square-512x512.png': 512,
        'shooter-social-1024x1024.png': 1024,
    }
}

class IconGenerator:
    def __init__(self, svg_path: str):
        self.svg_path = Path(svg_path)
        self.project_root = Path.cwd()
        self.assets_dir = self.project_root / 'assets' / 'icons'
        
        if not self.svg_path.exists():
            raise FileNotFoundError(f"SVG file not found: {svg_path}")
    
    def check_dependencies(self):
        """Check if required tools are available"""
        try:
            # Check for rsvg-convert (best quality)
            subprocess.run(['rsvg-convert', '--version'], 
                         capture_output=True, check=True)
            return 'rsvg-convert'
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass
            
        try:
            # Check for ImageMagick convert
            subprocess.run(['convert', '-version'], 
                         capture_output=True, check=True)
            return 'imagemagick'
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass
            
        # Check for Cairo (cairosvg)
        try:
            import cairosvg
            return 'cairosvg'
        except ImportError:
            pass
            
        raise RuntimeError(
            "No SVG converter found. Please install one of:\n"
            "- rsvg-convert: brew install librsvg\n"
            "- ImageMagick: brew install imagemagick\n"
            "- cairosvg: pip install cairosvg"
        )
    
    def convert_svg_to_png(self, output_path: Path, size: int, converter: str):
        """Convert SVG to PNG with high quality"""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        if converter == 'rsvg-convert':
            # Best quality with librsvg
            cmd = [
                'rsvg-convert',
                '--format=png',
                '--width', str(size),
                '--height', str(size),
                '--background-color', 'transparent',
                '--output', str(output_path),
                str(self.svg_path)
            ]
        elif converter == 'imagemagick':
            # Good quality with ImageMagick
            cmd = [
                'convert',
                '-background', 'transparent',
                '-density', '300',  # High DPI for quality
                '-resize', f'{size}x{size}',
                str(self.svg_path),
                str(output_path)
            ]
        elif converter == 'cairosvg':
            # Python-based conversion
            import cairosvg
            cairosvg.svg2png(
                url=str(self.svg_path),
                write_to=str(output_path),
                output_width=size,
                output_height=size,
                background_color='transparent'
            )
            return
            
        # Run the command
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error converting {output_path}: {result.stderr}")
            return False
        return True
    
    def create_ico_file(self, png_paths: list, ico_path: Path):
        """Create ICO file from multiple PNG sizes"""
        ico_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Use ImageMagick to create ICO from multiple PNGs
        cmd = ['convert'] + [str(p) for p in png_paths] + [str(ico_path)]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error creating ICO {ico_path}: {result.stderr}")
            return False
        return True
    
    def generate_all_icons(self):
        """Generate all required icon formats and sizes"""
        converter = self.check_dependencies()
        print(f"Using converter: {converter}")
        
        total_icons = sum(len(configs) for configs in ICON_CONFIGS.values())
        current = 0
        
        # Store temp PNGs for ICO creation
        temp_ico_pngs = []
        
        for category, configs in ICON_CONFIGS.items():
            category_dir = self.assets_dir / category
            print(f"\nGenerating {category} icons...")
            
            for filename, size in configs.items():
                current += 1
                output_path = category_dir / filename
                
                print(f"[{current}/{total_icons}] {filename} ({size}x{size})")
                
                success = self.convert_svg_to_png(output_path, size, converter)
                if success:
                    print(f"  ✅ Created: {output_path}")
                    
                    # Collect sizes for ICO files
                    if category == 'desktop' and size in [16, 32, 48, 256]:
                        temp_ico_pngs.append((size, output_path))
                else:
                    print(f"  ❌ Failed: {output_path}")
        
        # Create ICO files
        print("\nGenerating ICO files...")
        
        # Web favicon.ico (16, 32, 48)
        web_ico_pngs = [
            self.assets_dir / 'web' / 'favicon-16x16.png',
            self.assets_dir / 'web' / 'favicon-32x32.png',
        ]
        
        # Create 48x48 for ICO
        temp_48 = self.assets_dir / 'web' / 'temp-48x48.png'
        if self.convert_svg_to_png(temp_48, 48, converter):
            web_ico_pngs.append(temp_48)
        
        favicon_ico = self.assets_dir / 'web' / 'favicon.ico'
        if self.create_ico_file(web_ico_pngs, favicon_ico):
            print(f"  ✅ Created: {favicon_ico}")
            # Clean up temp file
            temp_48.unlink(missing_ok=True)
        
        # Desktop shooter.ico (16, 32, 48, 256)
        desktop_ico_pngs = [
            self.assets_dir / 'desktop' / 'shooter-tray-16.png',
            self.assets_dir / 'desktop' / 'shooter-tray-32.png',
        ]
        
        # Create 48x48 for desktop ICO
        temp_desktop_48 = self.assets_dir / 'desktop' / 'temp-48x48.png'
        if self.convert_svg_to_png(temp_desktop_48, 48, converter):
            desktop_ico_pngs.append(temp_desktop_48)
        
        desktop_ico_pngs.append(self.assets_dir / 'desktop' / 'shooter-256.png')
        
        shooter_ico = self.assets_dir / 'desktop' / 'shooter.ico'
        if self.create_ico_file(desktop_ico_pngs, shooter_ico):
            print(f"  ✅ Created: {shooter_ico}")
            # Clean up temp file
            temp_desktop_48.unlink(missing_ok=True)
        
        print(f"\n🎉 Icon generation complete! Generated {total_icons} icons + ICO files")
        print("\nGenerated categories:")
        for category in ICON_CONFIGS.keys():
            icon_count = len(ICON_CONFIGS[category])
            print(f"  - {category}: {icon_count} icons")

def main():
    if len(sys.argv) != 2:
        print("Usage: python generate-icons.py <svg-file>")
        print("Example: python generate-icons.py assets/icons/shooter-icon-dark.svg")
        sys.exit(1)
    
    svg_file = sys.argv[1]
    
    try:
        generator = IconGenerator(svg_file)
        generator.generate_all_icons()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()