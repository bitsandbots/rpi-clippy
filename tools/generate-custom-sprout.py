#!/usr/bin/env python3
"""Procedurally generate custom Sprout character assets.

This script draws a cute 2D vector-style potted plant (Sprout) with various
animations, accessories, and states. It generates all 44 APNG animation files
required by the Clippy/Sprout assistant and writes the TSX registry.
"""

from __future__ import annotations

import math
import os
import re
import sys
from pathlib import Path
from typing import Tuple, List, Dict, Any

from PIL import Image, ImageDraw, ImageFilter

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SPROUT_ANIMATIONS_DIR = PROJECT_ROOT / "src" / "renderer" / "images" / "animations" / "sprout"
SPROUT_TSX_FILE = PROJECT_ROOT / "src" / "renderer" / "sprout-animations.tsx"

# Output size (3x the legacy 124x93); W2/H2 is the fixed design canvas
W, H = 372, 279
W2, H2 = 248, 186

# CoreConduit / Silver theme and plant colors
COLOR_POT = (224, 112, 24)        # CoreConduit orange / terracotta
COLOR_POT_RIM = (235, 130, 50)    # lighter highlight pot rim
COLOR_POT_SHADOW = (168, 86, 15)  # dark terracotta shadow
COLOR_SOIL = (92, 64, 51)         # rich dark brown soil
COLOR_STEM = (90, 172, 46)        # vibrant green stem
COLOR_LEAF = (118, 194, 66)       # leaf green
COLOR_LEAF_SHADOW = (67, 139, 28) # dark leaf green shadow
COLOR_BLUSH = (255, 182, 193)     # pink cheeks
COLOR_EYE = (15, 15, 15)          # very dark grey eye
COLOR_WHITE = (255, 255, 255)

def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t

def lerp_color(c1: Tuple[int, int, int], c2: Tuple[int, int, int], t: float) -> Tuple[int, int, int]:
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))  # type: ignore[return-value]

def rotate_point(cx: float, cy: float, px: float, py: float, angle_deg: float) -> Tuple[float, float]:
    """Rotate a point (px, py) around center (cx, cy) by angle_deg degrees."""
    angle_rad = math.radians(angle_deg)
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    nx = cx + (px - cx) * cos_a - (py - cy) * sin_a
    ny = cy + (px - cx) * sin_a + (py - cy) * cos_a
    return nx, ny

def draw_rotated_ellipse(img: Image.Image, center: Tuple[int, int], size: Tuple[int, int], angle_deg: float, fill: Tuple[int, int, int, int] | Tuple[int, int, int]):
    """Draw an ellipse rotated by angle_deg degrees onto the transparent image."""
    # Create scratch canvas
    scratch = Image.new("RGBA", (W2, H2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(scratch)
    
    # Bounding box of ellipse centered at (W2/2, H2/2)
    cx, cy = W2 // 2, H2 // 2
    r_w, r_h = size[0] // 2, size[1] // 2
    draw.ellipse([cx - r_w, cy - r_h, cx + r_w, cy + r_h], fill=fill)
    
    # Rotate
    rotated = scratch.rotate(angle_deg, resample=Image.Resampling.BICUBIC)
    
    # Translate to destination center
    dx = center[0] - cx
    dy = center[1] - cy
    
    # Composite
    img.alpha_composite(rotated, (dx, dy))

def draw_sprout_frame(
    frame_idx: int,
    num_frames: int,
    bounce_y: float = 0.0,
    stem_bend: float = 0.0,
    left_leaf_angle: float = 150.0,
    right_leaf_angle: float = 30.0,
    eye_state: str = "normal",      # normal, wide, closed_happy, closed_sleep, blink
    eye_dir: Tuple[float, float] = (0.0, 0.0),
    mouth_state: str = "smile",     # smile, open_talk, circle_o, flat, none
    accessory: str = "none",        # none, wizard_hat, beret, glasses, pencil, broom, atom, floppy
    accessory_offset: Tuple[float, float] = (0.0, 0.0),
    exclamation: bool = False,
    question: bool = False,
    zzz_progress: float = -1.0,     # 0..1 to draw floating Zzz
    confetti_progress: float = -1.0,# 0..1 to draw confetti
    progress_angle: float = -1.0,   # angle in degrees to draw spinner
    show_scale: float = 1.0,        # scale for show/hide growing
    pencil_paper: bool = False,
    sweeping: float = -1.0,          # broom angle offset
    mail_progress: float = -1.0,    # paper plane progress
    rope_wrapped: bool = False
) -> Image.Image:
    """Create a single high-resolution frame of Sprout and downscale it for AA."""
    # Create base transparent image
    img = Image.new("RGBA", (W2, H2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Draw Pot & Soil (These do not scale with show_scale to look grounded)
    pot_top_y = H2 - 50
    pot_bot_y = H2 - 10
    
    # Rim (Terracotta rim)
    draw.rounded_rectangle([80, pot_top_y - 12, 168, pot_top_y], radius=6, fill=COLOR_POT_RIM)
    # Pot Body (Trapezoid using polygon)
    draw.polygon([(84, pot_top_y), (164, pot_top_y), (152, pot_bot_y), (96, pot_bot_y)], fill=COLOR_POT)
    # Soil Ellipse (contained in the rim)
    draw.ellipse([84, pot_top_y - 10, 164, pot_top_y - 2], fill=COLOR_SOIL)

    if rope_wrapped:
        # Draw some wrapped rope around the pot base
        draw.rounded_rectangle([92, pot_bot_y - 16, 156, pot_bot_y - 4], radius=4, fill=(210, 180, 140), outline=(139, 90, 43), width=2)
        draw.line([(100, pot_bot_y - 10), (148, pot_bot_y - 10)], fill=(139, 90, 43), width=2)

    # Base anchor point of the plant stem
    anchor_x, anchor_y = 124.0, float(pot_top_y - 6)

    # Calculate plant parts with show_scale & animation parameters
    if show_scale > 0.01:
        # Head and face centers relative to anchor
        head_rel_x = stem_bend * 15.0
        head_rel_y = -62.0 + bounce_y
        
        # Absolute positions
        head_x = anchor_x + head_rel_x * show_scale
        head_y = anchor_y + head_rel_y * show_scale
        
        head_r = 26.0 * show_scale
        
        # 2. Draw Stem (Curve from anchor to head center)
        ctrl_x = anchor_x + (head_rel_x * 0.5) * show_scale
        ctrl_y = anchor_y + (head_rel_y * 0.6) * show_scale
        
        # Stem thick Bezier or multi-segment line
        points = []
        for t in [0.0, 0.25, 0.5, 0.75, 1.0]:
            x = (1-t)**2 * anchor_x + 2*(1-t)*t * ctrl_x + t**2 * head_x
            y = (1-t)**2 * anchor_y + 2*(1-t)*t * ctrl_y + t**2 * head_y
            points.append((x, y))
        
        # Draw thick green stem
        draw.line(points, fill=COLOR_STEM, width=int(max(4, 12 * show_scale)))

        # 3. Draw Leaves
        leaf_size = (int(36 * show_scale), int(18 * show_scale))
        if leaf_size[0] > 1:
            # Left Leaf
            left_leaf_cx = head_x - 26 * show_scale
            left_leaf_cy = head_y + 10 * show_scale
            draw_rotated_ellipse(img, (int(left_leaf_cx), int(left_leaf_cy)), leaf_size, left_leaf_angle, COLOR_LEAF)
            
            # Right Leaf
            right_leaf_cx = head_x + 26 * show_scale
            right_leaf_cy = head_y + 10 * show_scale
            draw_rotated_ellipse(img, (int(right_leaf_cx), int(right_leaf_cy)), leaf_size, right_leaf_angle, COLOR_LEAF)

        # 4. Draw Head (Green plant head)
        if head_r > 1:
            draw.ellipse([head_x - head_r, head_y - head_r, head_x + head_r, head_y + head_r], fill=COLOR_LEAF)

        # 5. Draw Face
        eye_r = max(1.0, 4.0 * show_scale)
        pupil_r = max(0.5, 1.2 * show_scale)
        blush_rw = max(1.0, 5.0 * show_scale)
        blush_rh = max(0.5, 2.5 * show_scale)

        # Eyeballs / Eyes
        left_eye_cx = head_x - 10 * show_scale
        right_eye_cx = head_x + 10 * show_scale
        eye_cy = head_y - 2 * show_scale

        if eye_state == "blink" and (frame_idx % 8 in [4, 5]):
            # Draw blink as a line
            draw.line([(left_eye_cx - eye_r, eye_cy), (left_eye_cx + eye_r, eye_cy)], fill=COLOR_EYE, width=int(max(1, 2*show_scale)))
            draw.line([(right_eye_cx - eye_r, eye_cy), (right_eye_cx + eye_r, eye_cy)], fill=COLOR_EYE, width=int(max(1, 2*show_scale)))
        elif eye_state in ["closed_sleep", "closed_happy"]:
            # Draw closed curves (U-shape or arc)
            draw.arc([left_eye_cx - eye_r, eye_cy - eye_r, left_eye_cx + eye_r, eye_cy + eye_r], 0, 180, fill=COLOR_EYE, width=int(max(1, 2*show_scale)))
            draw.arc([right_eye_cx - eye_r, eye_cy - eye_r, right_eye_cx + eye_r, eye_cy + eye_r], 0, 180, fill=COLOR_EYE, width=int(max(1, 2*show_scale)))
        else: # normal, wide
            # Shift pupils based on eye_dir
            dx, dy = eye_dir[0] * show_scale, eye_dir[1] * show_scale
            
            # Left Eye
            draw.ellipse([left_eye_cx - eye_r, eye_cy - eye_r, left_eye_cx + eye_r, eye_cy + eye_r], fill=COLOR_EYE)
            draw.ellipse([left_eye_cx + dx - pupil_r, eye_cy + dy - pupil_r, left_eye_cx + dx + pupil_r, eye_cy + dy + pupil_r], fill=COLOR_WHITE)
            
            # Right Eye
            draw.ellipse([right_eye_cx - eye_r, eye_cy - eye_r, right_eye_cx + eye_r, eye_cy + eye_r], fill=COLOR_EYE)
            draw.ellipse([right_eye_cx + dx - pupil_r, eye_cy + dy - pupil_r, right_eye_cx + dx + pupil_r, eye_cy + dy + pupil_r], fill=COLOR_WHITE)

        # Blush cheeks
        if blush_rw > 1:
            draw.ellipse([left_eye_cx - 5*show_scale - blush_rw, eye_cy + 8*show_scale - blush_rh, left_eye_cx - 5*show_scale + blush_rw, eye_cy + 8*show_scale + blush_rh], fill=COLOR_BLUSH)
            draw.ellipse([right_eye_cx + 5*show_scale - blush_rw, eye_cy + 8*show_scale - blush_rh, right_eye_cx + 5*show_scale + blush_rw, eye_cy + 8*show_scale + blush_rh], fill=COLOR_BLUSH)

        # Mouth
        mouth_cx = head_x
        mouth_cy = head_y + 8 * show_scale
        if mouth_state == "smile":
            draw.arc([mouth_cx - 4*show_scale, mouth_cy - 4*show_scale, mouth_cx + 4*show_scale, mouth_cy + 1*show_scale], 0, 180, fill=COLOR_EYE, width=int(max(1, 2*show_scale)))
        elif mouth_state == "open_talk":
            # Small circle/oval
            draw.ellipse([mouth_cx - 3*show_scale, mouth_cy - 2*show_scale, mouth_cx + 3*show_scale, mouth_cy + 4*show_scale], fill=COLOR_EYE)
        elif mouth_state == "circle_o":
            draw.ellipse([mouth_cx - 3*show_scale, mouth_cy - 3*show_scale, mouth_cx + 3*show_scale, mouth_cy + 3*show_scale], fill=COLOR_EYE)
        elif mouth_state == "flat":
            draw.line([(mouth_cx - 3*show_scale, mouth_cy), (mouth_cx + 3*show_scale, mouth_cy)], fill=COLOR_EYE, width=int(max(1, 2*show_scale)))

        # 6. Draw Accessories
        ax, ay = head_x + accessory_offset[0]*show_scale, head_y + accessory_offset[1]*show_scale
        
        if accessory == "wizard_hat":
            # Draw blue conical hat with stars
            hat_pts = [(ax - 28*show_scale, ay - 14*show_scale), (ax + 28*show_scale, ay - 14*show_scale), (ax, ay - 58*show_scale)]
            draw.polygon(hat_pts, fill=(43, 60, 180), outline=COLOR_WHITE, width=int(max(1, 1.5*show_scale)))
            # Brim
            draw.rounded_rectangle([ax - 32*show_scale, ay - 18*show_scale, ax + 32*show_scale, ay - 12*show_scale], radius=4, fill=(35, 50, 150))
            # Yellow Star on Hat
            star_cx, star_cy = ax, ay - 36*show_scale
            draw.ellipse([star_cx - 3*show_scale, star_cy - 3*show_scale, star_cx + 3*show_scale, star_cy + 3*show_scale], fill=(240, 210, 20))
            
        elif accessory == "beret":
            # Red painter beret
            draw_rotated_ellipse(img, (int(ax), int(ay - 22*show_scale)), (int(48*show_scale), int(20*show_scale)), -15, (200, 30, 30))
            # Stem/tip
            draw.line([(ax - 4*show_scale, ay - 32*show_scale), (ax - 8*show_scale, ay - 36*show_scale)], fill=(160, 20, 20), width=2)
            
            # Palette & Brush held by leaf
            left_leaf_cx = head_x - 26 * show_scale
            left_leaf_cy = head_y + 10 * show_scale
            # Palette
            draw_rotated_ellipse(img, (int(left_leaf_cx - 15*show_scale), int(left_leaf_cy + 5*show_scale)), (int(24*show_scale), int(16*show_scale)), 10, (235, 210, 180))
            # Color spots on palette
            draw.ellipse([left_leaf_cx - 20*show_scale, left_leaf_cy + 2*show_scale, left_leaf_cx - 17*show_scale, left_leaf_cy + 5*show_scale], fill=(220, 30, 30))
            draw.ellipse([left_leaf_cx - 15*show_scale, left_leaf_cy + 4*show_scale, left_leaf_cx - 12*show_scale, left_leaf_cy + 7*show_scale], fill=(30, 180, 30))
            draw.ellipse([left_leaf_cx - 12*show_scale, left_leaf_cy + 1*show_scale, left_leaf_cx - 9*show_scale, left_leaf_cy + 4*show_scale], fill=(30, 30, 220))
            
        elif accessory == "glasses":
            # Cute black specs
            draw.rounded_rectangle([left_eye_cx - 7*show_scale, eye_cy - 5*show_scale, left_eye_cx + 7*show_scale, eye_cy + 5*show_scale], radius=3, outline=COLOR_EYE, width=int(max(1.5, 3*show_scale)))
            draw.rounded_rectangle([right_eye_cx - 7*show_scale, eye_cy - 5*show_scale, right_eye_cx + 7*show_scale, eye_cy + 5*show_scale], radius=3, outline=COLOR_EYE, width=int(max(1.5, 3*show_scale)))
            draw.line([(left_eye_cx + 6*show_scale, eye_cy), (right_eye_cx - 6*show_scale, eye_cy)], fill=COLOR_EYE, width=int(max(1.5, 3*show_scale)))

        if pencil_paper:
            # Draw paper
            paper_x1 = head_x + 36*show_scale
            paper_y1 = head_y + 15*show_scale
            draw.rectangle([paper_x1, paper_y1, paper_x1 + 32*show_scale, paper_y1 + 40*show_scale], fill=COLOR_WHITE, outline=(200, 200, 200), width=1)
            # Little lines on paper
            draw.line([(paper_x1 + 4*show_scale, paper_y1 + 10*show_scale), (paper_x1 + 28*show_scale, paper_y1 + 10*show_scale)], fill=(180, 180, 180), width=1)
            draw.line([(paper_x1 + 4*show_scale, paper_y1 + 20*show_scale), (paper_x1 + 24*show_scale, paper_y1 + 20*show_scale)], fill=(180, 180, 180), width=1)
            draw.line([(paper_x1 + 4*show_scale, paper_y1 + 30*show_scale), (paper_x1 + 28*show_scale, paper_y1 + 30*show_scale)], fill=(180, 180, 180), width=1)
            
            # Draw pencil in right leaf
            pencil_x = head_x + 28*show_scale
            pencil_y = head_y + 18*show_scale
            # Rotated pencil
            pencil_box = [pencil_x, pencil_y, pencil_x + 6*show_scale, pencil_y + 24*show_scale]
            draw_rotated_ellipse(img, (int(pencil_x), int(pencil_y)), (int(8*show_scale), int(20*show_scale)), -30, (230, 210, 40))

        if sweeping > -1.0:
            # Broom drawing
            broom_angle = sweeping
            broom_cx = head_x - 32*show_scale
            broom_cy = head_y + 24*show_scale
            # Handle
            hx, hy = rotate_point(broom_cx, broom_cy, broom_cx, broom_cy - 48*show_scale, broom_angle)
            draw.line([(broom_cx, broom_cy), (hx, hy)], fill=(150, 110, 60), width=3)
            # Straw bristles
            bx1, by1 = rotate_point(broom_cx, broom_cy, broom_cx - 12*show_scale, broom_cy + 16*show_scale, broom_angle)
            bx2, by2 = rotate_point(broom_cx, broom_cy, broom_cx + 12*show_scale, broom_cy + 16*show_scale, broom_angle)
            draw.polygon([(broom_cx, broom_cy), (bx1, by1), (bx2, by2)], fill=(220, 200, 100))

        if mail_progress > -1.0:
            # Paper plane flying across
            plane_x = -30 + mail_progress * (W2 + 60)
            plane_y = head_y - 20*show_scale + math.sin(mail_progress * math.pi * 2) * 20*show_scale
            draw.polygon([(plane_x, plane_y), (plane_x - 16, plane_y - 4), (plane_x - 10, plane_y + 6)], fill=COLOR_WHITE, outline=(200,200,200))
            draw.line([(plane_x, plane_y), (plane_x - 10, plane_y + 6)], fill=(180,180,180))

        if accessory == "floppy":
            # Floppy disk held by Sprout
            fx = head_x + 18*show_scale
            fy = head_y + 10*show_scale
            draw.rounded_rectangle([fx, fy, fx + 24*show_scale, fy + 24*show_scale], radius=2, fill=(30, 50, 130))
            draw.rectangle([fx + 4*show_scale, fy + 14*show_scale, fx + 20*show_scale, fy + 24*show_scale], fill=COLOR_WHITE) # label

    # 7. Non-scaled elements/floaters (floating Zzz, exclamation, question, spinner, confetti)
    # Exclamation mark
    if exclamation:
        ex_x = head_x
        ex_y = head_y - head_r - 20
        draw.line([(ex_x, ex_y), (ex_x, ex_y + 12)], fill=(220, 30, 30), width=3)
        draw.ellipse([ex_x - 2, ex_y + 16, ex_x + 2, ex_y + 20], fill=(220, 30, 30))

    # Question mark
    if question:
        q_x = head_x
        q_y = head_y - head_r - 24
        draw.arc([q_x - 6, q_y, q_x + 6, q_y + 10], 180, 360, fill=(40, 100, 220), width=3)
        draw.line([(q_x + 6, q_y + 5), (q_x + 6, q_y + 12)], fill=(40, 100, 220), width=3)
        draw.line([(q_x + 6, q_y + 12), (q_x, q_y + 15)], fill=(40, 100, 220), width=3)
        draw.ellipse([q_x - 2, q_y + 19, q_x + 2, q_y + 23], fill=(40, 100, 220))

    # Floating Zzz
    if zzz_progress >= 0.0:
        zx = head_x + 20 + zzz_progress * 40
        zy = head_y - head_r - 10 - zzz_progress * 30
        size = 6 + zzz_progress * 10
        # Draw "Z"
        draw.line([(zx, zy), (zx + size, zy)], fill=(120, 180, 240), width=2)
        draw.line([(zx + size, zy), (zx, zy + size)], fill=(120, 180, 240), width=2)
        draw.line([(zx, zy + size), (zx + size, zy + size)], fill=(120, 180, 240), width=2)

    # Spinner (for Processing)
    if progress_angle >= 0.0:
        sx, sy = head_x, head_y - head_r - 16
        draw.arc([sx - 10, sy - 10, sx + 10, sy + 10], progress_angle, progress_angle + 270, fill=(43, 125, 233), width=3)

    # Confetti
    if confetti_progress >= 0.0:
        colors = [(240, 50, 50), (50, 240, 50), (50, 50, 240), (240, 240, 50), (240, 50, 240)]
        for i in range(8):
            cx = head_x - 50 + (i * 15) + math.sin(confetti_progress * math.pi * 2 + i) * 10
            cy = head_y - head_r - 20 + confetti_progress * 60 + (i % 3) * 5
            if cy < H2 - 50:
                color = colors[i % len(colors)]
                draw.rectangle([cx - 2, cy - 2, cx + 2, cy + 2], fill=color)

    # Atom orbit
    if accessory == "atom":
        ax, ay = head_x, head_y - head_r - 15
        draw.ellipse([ax - 4, ay - 4, ax + 4, ay + 4], fill=(220, 30, 30)) # nucleus
        # Two orbiting ellipses
        draw_rotated_ellipse(img, (int(ax), int(ay)), (28, 10), frame_idx * 15, COLOR_WHITE)
        draw_rotated_ellipse(img, (int(ax), int(ay)), (28, 10), -frame_idx * 15 + 45, COLOR_WHITE)

    # Resize down to W, H with Lanczos (anti-aliasing) then sharpen
    final_img = img.resize((W, H), Image.Resampling.LANCZOS)
    final_img = final_img.filter(ImageFilter.UnsharpMask(radius=0.6, percent=130, threshold=3))
    return final_img

def save_animation(filename: str, frames: List[Image.Image], durations: List[int]) -> int:
    """Save an animated image (APNG) or static PNG to sprout/ folder."""
    SPROUT_ANIMATIONS_DIR.mkdir(parents=True, exist_ok=True)
    dest_path = SPROUT_ANIMATIONS_DIR / filename
    
    if len(frames) == 1:
        frames[0].save(dest_path, format="PNG")
        total_duration = 100
    else:
        frames[0].save(
            dest_path,
            format="PNG",
            save_all=True,
            append_images=frames[1:],
            duration=durations,
            loop=0,
        )
        total_duration = sum(durations)
        
    print(f"Generated {filename} ({len(frames)} frames, {total_duration}ms)")
    return total_duration

# Create 44 Animations
def generate_all():
    durations: Dict[str, int] = {}
    
    # 1. Default (Breathing, blinking)
    frames_default = []
    for i in range(12):
        bounce = math.sin(i * math.pi / 6) * 2.0
        eye = "blink" if i in [5, 6] else "normal"
        frames_default.append(draw_sprout_frame(i, 12, bounce_y=bounce, eye_state=eye))
    durations["Default"] = save_animation("Default.png", frames_default, [120]*12)
    durations["RestPose"] = save_animation("RestPose.png", frames_default, [120]*12)
    durations["Idle1_1"] = save_animation("Idle1_1.png", frames_default, [120]*12)

    # 2. Alert
    frames_alert = []
    for i in range(8):
        vibe = math.sin(i * math.pi) * 2.0
        frames_alert.append(draw_sprout_frame(i, 8, bounce_y=-4.0, stem_bend=vibe*0.1, left_leaf_angle=120, right_leaf_angle=60, eye_state="wide", exclamation=True))
    durations["Alert"] = save_animation("Alert.png", frames_alert, [80]*8)

    # 3. CheckingSomething
    frames_check = []
    for i in range(10):
        # Look down and gesture with pencil
        frames_check.append(draw_sprout_frame(i, 10, bounce_y=1.0, stem_bend=0.3, eye_dir=(3, 5), pencil_paper=True, right_leaf_angle=0 + (i%2)*20))
    durations["CheckingSomething"] = save_animation("CheckingSomething.png", frames_check, [120]*10)

    # 4. Congratulate
    frames_cong = []
    for i in range(12):
        bounce = -abs(math.sin(i * math.pi / 4)) * 6.0
        conf_prog = i / 12.0
        frames_cong.append(draw_sprout_frame(i, 12, bounce_y=bounce, mouth_state="open_talk", eye_state="closed_happy", confetti_progress=conf_prog))
    durations["Congratulate"] = save_animation("Congratulate.png", frames_cong, [100]*12)

    # 5. EmptyTrash
    frames_trash = []
    for i in range(10):
        sweep = math.sin(i * math.pi / 5) * 25.0
        frames_trash.append(draw_sprout_frame(i, 10, stem_bend=-0.2, eye_dir=(-4, 2), sweeping=sweep))
    durations["EmptyTrash"] = save_animation("EmptyTrash.png", frames_trash, [120]*10)

    # 6. Explain (talking, gesturing)
    frames_explain = []
    for i in range(12):
        mouth = "open_talk" if i % 2 == 0 else "smile"
        bend = math.sin(i * math.pi / 4) * 0.4
        frames_explain.append(draw_sprout_frame(i, 12, stem_bend=bend, mouth_state=mouth, left_leaf_angle=130 + bend*20, right_leaf_angle=50 + bend*20))
    durations["Explain"] = save_animation("Explain.png", frames_explain, [120]*12)

    # 7. Gestures: GestureDown, GestureLeft, GestureRight, GestureUp
    frames_gd = [draw_sprout_frame(0, 1, stem_bend=0.1, right_leaf_angle=70, left_leaf_angle=160, eye_dir=(0, 4))]
    durations["GestureDown"] = save_animation("GestureDown.png", frames_gd, [1000])

    frames_gl = [draw_sprout_frame(0, 1, stem_bend=-0.5, left_leaf_angle=190, eye_dir=(-5, -2))]
    durations["GestureLeft"] = save_animation("GestureLeft.png", frames_gl, [1000])

    frames_gr = [draw_sprout_frame(0, 1, stem_bend=0.5, right_leaf_angle=-10, eye_dir=(5, -2))]
    durations["GestureRight"] = save_animation("GestureRight.png", frames_gr, [1000])

    frames_gu = [draw_sprout_frame(0, 1, bounce_y=-4, right_leaf_angle=90, left_leaf_angle=90, eye_dir=(0, -5))]
    durations["GestureUp"] = save_animation("GestureUp.png", frames_gu, [1000])

    # 8. GetArtsy
    frames_artsy = []
    for i in range(8):
        bounce = math.sin(i * math.pi / 4) * 1.5
        frames_artsy.append(draw_sprout_frame(i, 8, bounce_y=bounce, accessory="beret"))
    durations["GetArtsy"] = save_animation("GetArtsy.png", frames_artsy, [150]*8)

    # 9. GetAttention (Jumping & waving)
    frames_att = []
    for i in range(10):
        bounce = -abs(math.sin(i * math.pi / 2.5)) * 8.0
        wave = math.sin(i * math.pi) * 30
        frames_att.append(draw_sprout_frame(i, 10, bounce_y=bounce, mouth_state="open_talk", eye_state="wide", left_leaf_angle=150 + wave, right_leaf_angle=30 - wave))
    durations["GetAttention"] = save_animation("GetAttention.png", frames_att, [80]*10)

    # 10. GetTechy
    frames_techy = []
    for i in range(8):
        bounce = math.sin(i * math.pi / 4) * 1.0
        frames_techy.append(draw_sprout_frame(i, 8, bounce_y=bounce, accessory="glasses"))
    durations["GetTechy"] = save_animation("GetTechy.png", frames_techy, [150]*8)

    # 11. GetWizardy
    frames_wiz = []
    for i in range(8):
        bounce = math.sin(i * math.pi / 4) * 1.0
        frames_wiz.append(draw_sprout_frame(i, 8, bounce_y=bounce, accessory="wizard_hat", accessory_offset=(-2, -18)))
    durations["GetWizardy"] = save_animation("GetWizardy.png", frames_wiz, [150]*8)

    # 12. GoodBye / Greeting / Wave
    frames_wave = []
    for i in range(10):
        # Waving right leaf
        wave_angle = 30.0 + math.sin(i * math.pi / 2) * 35.0
        frames_wave.append(draw_sprout_frame(i, 10, bounce_y=1.0, right_leaf_angle=wave_angle, mouth_state="smile"))
    durations["GoodBye"] = save_animation("GoodBye.png", frames_wave, [100]*10)
    durations["Greeting"] = save_animation("Greeting.png", frames_wave, [100]*10)
    durations["Wave"] = save_animation("Wave.png", frames_wave, [100]*10)

    # 13. Hearing_1 (listening)
    frames_hearing = []
    for i in range(8):
        # Tilt and bend left leaf like an ear
        frames_hearing.append(draw_sprout_frame(i, 8, stem_bend=-0.3, eye_dir=(-4, -1), left_leaf_angle=90))
    durations["Hearing_1"] = save_animation("Hearing_1.png", frames_hearing, [125]*8)

    # 14. Hide & Show (Retracting / growing out of soil)
    frames_hide = []
    for i in range(10):
        scale = 1.0 - (i / 9.0)
        frames_hide.append(draw_sprout_frame(i, 10, show_scale=scale, mouth_state="none" if scale < 0.5 else "flat"))
    durations["Hide"] = save_animation("Hide.png", frames_hide, [100]*10)

    frames_show = []
    for i in range(10):
        scale = i / 9.0
        frames_show.append(draw_sprout_frame(i, 10, show_scale=scale, mouth_state="none" if scale < 0.5 else "smile"))
    durations["Show"] = save_animation("Show.png", frames_show, [100]*10)

    # 15. IdleAtom
    frames_atom = []
    for i in range(12):
        bounce = math.sin(i * math.pi / 6) * 1.5
        frames_atom.append(draw_sprout_frame(i, 12, bounce_y=bounce, accessory="atom"))
    durations["IdleAtom"] = save_animation("IdleAtom.png", frames_atom, [100]*12)

    # 16. IdleEyeBrowRaise
    frames_raise = []
    for i in range(8):
        # Blink/sassy gaze
        eye = "wide" if i >= 4 else "normal"
        frames_raise.append(draw_sprout_frame(i, 8, stem_bend=0.2, eye_state=eye, eye_dir=(2, -2)))
    durations["IdleEyeBrowRaise"] = save_animation("IdleEyeBrowRaise.png", frames_raise, [150]*8)

    # 17. IdleFingerTap (Tap a little leaf root)
    frames_tap = []
    for i in range(10):
        bounce = math.sin(i * math.pi / 5) * 1.0
        tap_angle = 150 + (25 if i % 2 == 0 else 0)
        frames_tap.append(draw_sprout_frame(i, 10, bounce_y=bounce, left_leaf_angle=tap_angle))
    durations["IdleFingerTap"] = save_animation("IdleFingerTap.png", frames_tap, [120]*10)

    # 18. IdleHeadScratch
    frames_scratch = []
    for i in range(10):
        scratch_angle = 90 + (math.sin(i * math.pi) * 20)
        frames_scratch.append(draw_sprout_frame(i, 10, stem_bend=0.1, right_leaf_angle=scratch_angle, eye_dir=(2, -3)))
    durations["IdleHeadScratch"] = save_animation("IdleHeadScratch.png", frames_scratch, [120]*10)

    # 19. IdleRopePile (wrapped in jumping rope or base rope)
    frames_rope = []
    for i in range(12):
        bounce = math.sin(i * math.pi / 6) * 2.0
        frames_rope.append(draw_sprout_frame(i, 12, bounce_y=bounce, rope_wrapped=True))
    durations["IdleRopePile"] = save_animation("IdleRopePile.png", frames_rope, [120]*12)

    # 20. IdleSideToSide (swaying side to side)
    frames_sway = []
    for i in range(12):
        bend = math.sin(i * math.pi / 6) * 0.5
        frames_sway.append(draw_sprout_frame(i, 12, stem_bend=bend, left_leaf_angle=150 + bend*25, right_leaf_angle=30 + bend*25))
    durations["IdleSideToSide"] = save_animation("IdleSideToSide.png", frames_sway, [100]*12)

    # 21. IdleSnooze (sleeping, drifting Zzz)
    frames_snooze = []
    for i in range(12):
        bounce = math.sin(i * math.pi / 6) * 1.5
        zzz_prog = (i / 12.0)
        frames_snooze.append(draw_sprout_frame(i, 12, bounce_y=bounce + 3, stem_bend=0.2, eye_state="closed_sleep", zzz_progress=zzz_prog, mouth_state="flat"))
    durations["IdleSnooze"] = save_animation("IdleSnooze.png", frames_snooze, [150]*12)

    # 22. Look Directions (Static look frames)
    durations["LookDown"] = save_animation("LookDown.png", [draw_sprout_frame(0, 1, eye_dir=(0, 5))], [1000])
    durations["LookDownLeft"] = save_animation("LookDownLeft.png", [draw_sprout_frame(0, 1, eye_dir=(-4, 4))], [1000])
    durations["LookDownRight"] = save_animation("LookDownRight.png", [draw_sprout_frame(0, 1, eye_dir=(4, 4))], [1000])
    durations["LookLeft"] = save_animation("LookLeft.png", [draw_sprout_frame(0, 1, eye_dir=(-5, 0))], [1000])
    durations["LookRight"] = save_animation("LookRight.png", [draw_sprout_frame(0, 1, eye_dir=(5, 0))], [1000])
    durations["LookUp"] = save_animation("LookUp.png", [draw_sprout_frame(0, 1, eye_dir=(0, -5))], [1000])
    durations["LookUpLeft"] = save_animation("LookUpLeft.png", [draw_sprout_frame(0, 1, eye_dir=(-4, -4))], [1000])
    durations["LookUpRight"] = save_animation("LookUpRight.png", [draw_sprout_frame(0, 1, eye_dir=(4, -4))], [1000])

    # 23. Print (sliding tiny paper out of the pot rim)
    frames_print = []
    for i in range(10):
        # Print paper sliding down
        OS = W / 124  # output-space scale factor
        paper_y = i * 2.0 * OS
        scratch = draw_sprout_frame(i, 10, bounce_y=-1.0)
        # Draw small printed slip from pot rim (coordinates in output W×H space)
        draw = ImageDraw.Draw(scratch)
        if i > 0:
            draw.rectangle([int(60*OS), int(80*OS) + int(paper_y), int(80*OS), int(95*OS) + int(paper_y)], fill=COLOR_WHITE, outline=(200,200,200))
        frames_print.append(scratch)
    durations["Print"] = save_animation("Print.png", frames_print, [120]*10)

    # 24. Processing (spinner rotating)
    frames_proc = []
    for i in range(12):
        angle = i * 30.0
        frames_proc.append(draw_sprout_frame(i, 12, progress_angle=angle))
    durations["Processing"] = save_animation("Processing.png", frames_proc, [100]*12)

    # 25. Save (holding a floppy disk)
    frames_save = []
    for i in range(8):
        bounce = math.sin(i * math.pi / 4) * 1.0
        frames_save.append(draw_sprout_frame(i, 8, bounce_y=bounce, accessory="floppy"))
    durations["Save"] = save_animation("Save.png", frames_save, [150]*8)

    # 26. Searching (magnifying glass)
    frames_search = []
    for i in range(10):
        bend = math.sin(i * math.pi / 5) * 0.4
        frames_search.append(draw_sprout_frame(i, 10, stem_bend=bend, eye_dir=(bend*5, 4), left_leaf_angle=180 + bend*20))
    durations["Searching"] = save_animation("Searching.png", frames_search, [120]*10)

    # 27. SendMail (paper airplane)
    frames_mail = []
    for i in range(12):
        prog = i / 12.0
        frames_mail.append(draw_sprout_frame(i, 12, eye_dir=(4, -2), mail_progress=prog))
    durations["SendMail"] = save_animation("SendMail.png", frames_mail, [100]*12)

    # 28. Thinking (question mark, looking up)
    frames_think = []
    for i in range(12):
        bounce = math.sin(i * math.pi / 6) * 1.0
        frames_think.append(draw_sprout_frame(i, 12, bounce_y=bounce, eye_dir=(-3, -4), right_leaf_angle=80, question=True))
    durations["Thinking"] = save_animation("Thinking.png", frames_think, [150]*12)

    # 29. Writing (pencil & pad)
    frames_write = []
    for i in range(12):
        pencil_shake = math.sin(i * math.pi) * 3.0
        frames_write.append(draw_sprout_frame(i, 12, stem_bend=0.2, eye_dir=(4, 4), pencil_paper=True, right_leaf_angle=30 + pencil_shake))
    durations["Writing"] = save_animation("Writing.png", frames_write, [100]*12)

    # Write out sprout-animations.tsx
    write_tsx(durations)

def safe_import_name(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]", "_", name)

def write_tsx(durations: Dict[str, int]):
    lines = [
        "// This file is auto-generated by tools/generate-custom-sprout.py",
        "",
        "export interface Animation {",
        "  src: string;",
        "  length: number;",
        "}",
        "",
    ]
    
    names = sorted(durations.keys())
    for name in names:
        import_name = safe_import_name(name)
        lines.append(f'import {import_name} from "./images/animations/sprout/{name}.png";')
        
    lines.append("")
    lines.append("export const SPROUT_ANIMATIONS: Record<string, Animation> = {")
    
    for name in names:
        import_name = safe_import_name(name)
        display_name = name.replace("_", " ")
        lines.append(f"  '{display_name}': {{")
        lines.append(f"    src: {import_name},")
        lines.append(f"    length: {durations[name]},")
        lines.append("  },")
        
    lines.append("};")
    
    with open(SPROUT_TSX_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Generated TypeScript module at {SPROUT_TSX_FILE}")

if __name__ == "__main__":
    generate_all()
    print("All Sprout character animations procedurally generated successfully!")
