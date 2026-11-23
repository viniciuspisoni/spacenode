#!/usr/bin/env python3
"""SpaceNode for Archicad — build / test / package / install driver.

    python3 archicad/tools/archicad.py deps            # fetch API DevKit + official CMake tools (pinned, checksummed)
    python3 archicad/tools/archicad.py test            # portable core tests (no Archicad needed)
    python3 archicad/tools/archicad.py build           # configure + build the add-on
    python3 archicad/tools/archicad.py package         # zip the add-on (dist/)
    python3 archicad/tools/archicad.py install         # copy the add-on next to Archicad and print the steps

Stdlib only. Needs: cmake >= 3.19, Python >= 3.10 for the Graphisoft resource
tools (this script finds one or take --python), Xcode / Command Line Tools on
macOS, Visual Studio 2022 (toolset v143) on Windows.
"""
import argparse
import hashlib
import json
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent          # archicad/
DEPS = ROOT / ".deps"
BUILD = ROOT / "build"
DIST = ROOT / "dist"

# Archicad 29 is the target: latest public API DevKit and the oldest we
# consider worth supporting (the add-on only uses API calls present since 25).
AC_VERSION = "29"
DEVKIT_RELEASE = "29.3100"
DEVKIT_BUILD = "3100"
DEVKIT = {
    "MAC": {
        "url": "https://github.com/GRAPHISOFT/archicad-api-devkit/releases/download/29.3100/API.Development.Kit.MAC.29.3100.zip",
        "sha256": "dc6c450c5b185d3539be51a93eb85b82c48a992ba84b9703551d4a6d68e3dfe9",
    },
    "WIN": {
        "url": "https://github.com/GRAPHISOFT/archicad-api-devkit/releases/download/29.3100/API.Development.Kit.WIN.29.3100.zip",
        "sha256": "29482389be83cb4222ba1d341654111ba06db5cb2b628165f930fb8c55860b0b",
    },
}
TOOLS_REPO = "https://github.com/GRAPHISOFT/archicad-addon-cmake-tools.git"
TOOLS_SHA = "96a8f46ac29e1bfeb4b24ac619b54f8421faf921"


def plat() -> str:
    return {"Darwin": "MAC", "Windows": "WIN"}.get(platform.system(), "")


def run(cmd, **kw):
    print("+ " + " ".join(str(c) for c in cmd), flush=True)
    subprocess.run([str(c) for c in cmd], check=True, **kw)


def config():
    return json.loads((ROOT / "config.json").read_text(encoding="utf-8"))


def devkit_support() -> pathlib.Path:
    return DEPS / ("devkit-" + DEVKIT_RELEASE + "-" + plat().lower()) / "Support"


# ── deps ─────────────────────────────────────────────────────────────────────

def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def cmd_deps(_args):
    if not plat():
        sys.exit("Archicad add-ons build on macOS and Windows only.")
    DEPS.mkdir(exist_ok=True)

    support = devkit_support()
    if not (support / "Inc" / "ACAPinc.h").exists():
        info = DEVKIT[plat()]
        zip_path = DEPS / pathlib.Path(info["url"]).name
        if not zip_path.exists():
            print("Downloading " + info["url"])
            with urllib.request.urlopen(info["url"], timeout=120) as resp, open(zip_path, "wb") as out:
                shutil.copyfileobj(resp, out)
        digest = sha256(zip_path)
        if digest != info["sha256"]:
            zip_path.unlink()
            sys.exit("API DevKit checksum mismatch (%s). Refusing to use it." % digest)
        target = support.parent
        tmp = pathlib.Path(tempfile.mkdtemp(dir=DEPS))
        with zipfile.ZipFile(zip_path) as z:
            for member in z.infolist():
                unix_mode = (member.external_attr >> 16) & 0o177777
                if (unix_mode & 0o170000) == 0o120000:
                    # frameworks are full of symlinks (Versions/Current -> A, ...)
                    link = tmp / member.filename
                    link.parent.mkdir(parents=True, exist_ok=True)
                    if link.is_symlink() or link.exists():
                        link.unlink()
                    os.symlink(z.read(member).decode("utf-8"), link)
                    continue
                extracted = z.extract(member, tmp)
                if (unix_mode & 0o777) and not member.is_dir():
                    os.chmod(extracted, unix_mode & 0o777)   # extractall() drops the exec bit of Support/Tools/OSX/*
        target = support.parent
        shutil.rmtree(target, ignore_errors=True)
        shutil.move(str(tmp), str(target))
        shutil.rmtree(target / "__MACOSX", ignore_errors=True)
        print("API DevKit %s ready: %s" % (DEVKIT_RELEASE, support))
    else:
        print("API DevKit %s already present." % DEVKIT_RELEASE)

    tools = DEPS / "tools"
    if not (tools / "CMakeCommon.cmake").exists():
        shutil.rmtree(tools, ignore_errors=True)
        run(["git", "clone", "--quiet", TOOLS_REPO, tools])
    run(["git", "-C", tools, "checkout", "--quiet", TOOLS_SHA])
    print("archicad-addon-cmake-tools @ " + TOOLS_SHA[:8])


# ── test ─────────────────────────────────────────────────────────────────────

def cmd_test(args):
    """Core tests: plain C++ compiler, no DevKit, no Archicad, no network."""
    if plat() == "WIN" and not shutil.which("c++"):
        sys.exit("On Windows run the tests through CMake: cmake -S archicad/tests -B archicad/build/tests && cmake --build archicad/build/tests && ctest --test-dir archicad/build/tests")
    run(["sh", ROOT / "tests" / "run-unit.sh"] + ([args.filter] if args.filter else []))


# ── build ────────────────────────────────────────────────────────────────────

def find_python310(explicit):
    candidates = [explicit] if explicit else [sys.executable, "python3.13", "python3.12", "python3.11", "python3.10", "python3", "python"]
    for c in candidates:
        exe = shutil.which(c) if c else None
        if not exe:
            continue
        try:
            out = subprocess.run([exe, "-c", "import sys;print(sys.version_info >= (3, 10))"], capture_output=True, text=True, timeout=20)
        except Exception:
            continue
        if out.stdout.strip() == "True":
            return exe
    sys.exit("Python >= 3.10 is required by Graphisoft's resource tools. Pass --python /path/to/python3.12")


def cmd_build(args):
    cmd_deps(args) if not (devkit_support() / "Inc").exists() or not (DEPS / "tools" / "CMakeCommon.cmake").exists() else None
    cmake = shutil.which("cmake")
    if not cmake:
        sys.exit("cmake not found (>= 3.19). Install it (https://cmake.org) or `pip install cmake`.")
    py = find_python310(args.python)
    out = BUILD / AC_VERSION / "INT"
    params = [
        cmake, "-S", ROOT, "-B", out,
        "-DAC_VERSION=" + AC_VERSION,
        "-DAC_API_DEVKIT_DIR=" + str(devkit_support()),
        "-DGS_CONFIG_JSON_PATH=" + str(ROOT / "config.json"),
        "-DLP_XML_CONVERTER_FOLDER=" + str(devkit_support() / "LP_XMLConverter"),
        "-DAC_ADDON_LANGUAGE=INT",
        "-DAC_USE_LOCAL_DEVKIT=ON", "-DDEVKIT_BUILDNUM=" + DEVKIT_BUILD,
        "-DPython3_EXECUTABLE=" + py,
    ]
    if args.release:
        params.append("-DAC_ADDON_FOR_DISTRIBUTION=ON")
    if plat() == "MAC":
        have_xcode = subprocess.run(["xcodebuild", "-version"], capture_output=True).returncode == 0
        if have_xcode:
            params += ["-GXcode"]
        else:
            sdk = subprocess.check_output(["xcode-select", "-p"], text=True).strip() + "/SDKs/MacOSX.sdk"
            params += ["-GUnix Makefiles", "-DCMAKE_BUILD_TYPE=" + args.config, "-DCMAKE_C_COMPILER=/usr/bin/clang",
                       "-DCMAKE_CXX_COMPILER=/usr/bin/clang++", "-DCMAKE_OBJCXX_COMPILER=/usr/bin/clang++",
                       "-DCMAKE_OSX_SYSROOT=" + sdk]
    else:
        gen = os.environ.get("ARCHICAD_CMAKE_GENERATOR", "Visual Studio 17 2022")
        params += ["-G", gen, "-A", "x64", "-T", "v143", "-DAC_WIN_LANGCHARSET=040904b0", "-DAC_WIN_LANGUAGEID=1033", "-DAC_WIN_CHARSETID=1200"]
    run(params)
    # The template's resource step doesn't track the generated HTML: force it.
    stamp = out / "ResourceObjects" / "AddOnResources.stamp"
    if stamp.exists():
        stamp.unlink()
    run([cmake, "--build", out, "--config", args.config, "--parallel"])
    result = find_result(out)
    print("\nBuilt: " + str(result))


def find_result(out: pathlib.Path) -> pathlib.Path:
    name = config()["addOnName"]
    suffix = ".bundle" if plat() == "MAC" else ".apx"
    hits = sorted(out.rglob(name + suffix), key=lambda p: p.stat().st_mtime, reverse=True)
    if not hits:
        sys.exit("Build finished but %s%s was not found under %s" % (name, suffix, out))
    return hits[0]


# ── package / install ────────────────────────────────────────────────────────

def codesign(bundle: pathlib.Path, identity):
    if plat() != "MAC":
        return
    if identity:
        run(["codesign", "--force", "--deep", "--timestamp", "--options", "runtime", "--sign", identity, bundle])
    else:
        # arm64 refuses unsigned code; an ad-hoc seal is enough for local use.
        run(["codesign", "--force", "--deep", "--sign", "-", bundle])
    run(["codesign", "--verify", "--deep", "--strict", bundle])


INSTALL_TXT = """SpaceNode for Archicad {version} (Archicad {ac}, {platform})

1. Close Archicad.
2. Copy {artifact} to a folder of your choice (for example the Add-Ons folder inside your Archicad installation).
3. Open Archicad > Options > Add-On Manager > Edit List of Available Add-Ons... > Add... and pick {artifact}.
4. Restart Archicad. Open the panel from Options > SpaceNode.
5. Click "Connect", approve the code in your browser, then open a 3D window (F3) and generate.

{unsigned}Uninstall: remove the entry in the Add-On Manager and delete {artifact}.
"""


def cmd_package(args):
    bundle = find_result(BUILD / AC_VERSION / "INT")
    cfg = config()
    stage = pathlib.Path(tempfile.mkdtemp(dir=BUILD))
    artifact = bundle.name
    dest = stage / artifact
    if bundle.is_dir():
        shutil.copytree(bundle, dest, symlinks=True)
    else:
        shutil.copy2(bundle, dest)
    codesign(dest, args.sign)
    unsigned = ""
    if plat() == "MAC" and not args.sign:
        unsigned = ("This build is ad-hoc signed for testing. If macOS blocks it, remove the quarantine flag:\n"
                    "  xattr -dr com.apple.quarantine %s\nFor distribution, sign with a Developer ID and notarize (see README).\n\n" % artifact)
    (stage / "INSTALL.txt").write_text(INSTALL_TXT.format(version=cfg["version"], ac=AC_VERSION, platform=plat(), artifact=artifact, unsigned=unsigned), encoding="utf-8")
    DIST.mkdir(exist_ok=True)
    zip_path = DIST / ("SpaceNode-Archicad-%s-AC%s-%s.zip" % (cfg["version"], AC_VERSION, plat()))
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(stage.rglob("*")):
            if p.is_symlink():
                info = zipfile.ZipInfo(str(p.relative_to(stage)))
                info.create_system = 3
                info.external_attr = 0o120755 << 16
                z.writestr(info, os.readlink(p))
            elif p.is_file():
                z.write(p, p.relative_to(stage))
    shutil.rmtree(stage, ignore_errors=True)
    (zip_path.with_suffix(".zip.sha256")).write_text("%s  %s\n" % (sha256(zip_path), zip_path.name), encoding="utf-8")
    print("Packaged: %s" % zip_path)


def default_archicad_addon_dirs():
    if plat() == "MAC":
        # The install root and Add-Ons folder are localized by the Archicad
        # installer. For example, Archicad 29 pt-BR uses Graphisoft/Extensões.
        roots = [pathlib.Path("/Applications") / vendor / ("Archicad " + AC_VERSION)
                 for vendor in ("Graphisoft", "GRAPHISOFT")]
        names = ("Add-Ons", "Extensões", "Extensions")
        return [root / name for root in roots for name in names]
    pf = os.environ.get("ProgramFiles", r"C:\Program Files")
    return [pathlib.Path(pf) / "GRAPHISOFT" / ("Archicad " + AC_VERSION) / "Add-Ons"]


def cmd_install(args):
    bundle = find_result(BUILD / AC_VERSION / "INT")
    if args.dest:
        dest_dir = pathlib.Path(args.dest).expanduser()
    else:
        dest_dir = next((d for d in default_archicad_addon_dirs() if d.is_dir() and os.access(d, os.W_OK)), None)
        if dest_dir is None:
            dest_dir = pathlib.Path.home() / "Documents" / "SpaceNode" / "Archicad" / AC_VERSION
    dest_dir.mkdir(parents=True, exist_ok=True)
    target = dest_dir / bundle.name
    if target.exists():
        shutil.rmtree(target) if target.is_dir() else target.unlink()
    if bundle.is_dir():
        shutil.copytree(bundle, target, symlinks=True)
    else:
        shutil.copy2(bundle, target)
    codesign(target, args.sign)
    print("\nInstalled: %s\n" % target)
    print("Next, in Archicad %s: Options > Add-On Manager > Edit List of Available Add-Ons... > Add... > %s, then restart Archicad." % (AC_VERSION, target))
    print("Open the panel from Options > SpaceNode. For a dev/staging API: SPACENODE_API_URL=http://localhost:3000 (launch Archicad from a terminal).")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("deps").set_defaults(fn=cmd_deps)
    t = sub.add_parser("test")
    t.add_argument("--filter")
    t.set_defaults(fn=cmd_test)
    b = sub.add_parser("build")
    b.add_argument("--config", default="RelWithDebInfo", choices=["Debug", "RelWithDebInfo", "Release"])
    b.add_argument("--release", action="store_true", help="mark the add-on 'for distribution' (needs real MDIDs)")
    b.add_argument("--python", help="Python >= 3.10 for Graphisoft's resource tools")
    b.set_defaults(fn=cmd_build)
    k = sub.add_parser("package")
    k.add_argument("--sign", help="macOS codesign identity (default: ad-hoc)")
    k.set_defaults(fn=cmd_package)
    i = sub.add_parser("install")
    i.add_argument("--dest", help="folder to copy the add-on into")
    i.add_argument("--sign", help="macOS codesign identity (default: ad-hoc)")
    i.set_defaults(fn=cmd_install)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
