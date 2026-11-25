#!/usr/bin/env python3
# Anonymize TM/WebApp/data.json in place:
#  - Replace every employee name with a unique fictional name,
#    applied consistently to employees[] and records[] (keyed by PN).
#  - Replace real project names in wbs[] with unique fictional names.
#    Generic internal buckets (ABSENCE, MEETINGS, ...) are kept because
#    the web app's color maps key on them.
# Deterministic (seeded) so reruns produce the same output.

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "TM" / "WebApp" / "data.json"

SEED = 42

# Internal, non-sensitive buckets that the web app color maps reference.
KEEP_PROJECTS = {
    "ABSENCE", "CONT IMPR", "KNOWL MGMT", "MEETINGS", "TRAINING",
    "NB SUPPORT", "Management", "Missing ", "P&IT",
}

FIRST_NAMES = [
    "Ava", "Liam", "Noah", "Emma", "Mia", "Ethan", "Sofia", "Lucas",
    "Nora", "Owen", "Isla", "Caleb", "Ruby", "Felix", "Ivy", "Hugo",
    "Clara", "Jonas", "Elena", "Marco", "Tessa", "Rafael", "Freya",
    "Dante", "Alma", "Viktor", "Lena", "Oscar", "Petra", "Silas",
    "Wren", "Anders", "Bianca", "Cyrus", "Delia", "Emil", "Greta",
    "Hakan", "Ines", "Joel", "Katia", "Lars",
]

LAST_NAMES = [
    "Hartwell", "Brennan", "Okafor", "Lindqvist", "Marchetti", "Novak",
    "Ferreira", "Kowalski", "Ashford", "Delacroix", "Ryder", "Solberg",
    "Vance", "Whitmore", "Castellano", "Drummond", "Eriksen", "Falk",
    "Grantham", "Holloway", "Ibarra", "Jansson", "Kessler", "Lombardi",
    "Mercer", "Nystrom", "Oduya", "Prescott", "Quintero", "Rosales",
    "Sterling", "Thackeray", "Ulrich", "Varga", "Winslow", "Xiong",
    "Yates", "Zetterberg", "Abelson", "Bergman", "Calloway", "Dahl",
]

FAKE_PROJECTS = [
    "Atlas Cab Redesign", "Aurora EV Launch", "Borealis Fleet Telemetry",
    "Cascade Chassis Update", "Cobalt Powertrain Study", "Comet Trailer Aero",
    "Condor Long Haul", "Coral Dashboard Refresh", "Delta Axle Program",
    "Drift Cooling Systems", "Echo Cabin Acoustics", "Ember Hybrid Pilot",
    "Falcon Freight App", "Fjord Export Program", "Granite Frame Redesign",
    "Harbor Logistics Suite", "Horizon Safety Package", "Juniper Lightweighting",
    "Keystone Service Portal", "Lumen Headlamp Design", "Meridian Nav Stack",
    "Nimbus Cloud Diagnostics", "Onyx Interior Trim", "Orion Battery Pack",
    "Pioneer Autonomy Study", "Quartz Sensor Fusion", "Ridgeline Suspension",
    "Sable Aero Kit", "Summit Emissions 2028", "Tundra Cold Weather Kit",
    "Vector Connected Cab", "Vertex Marketing 2026", "Voyager Media Suite",
    "Wildcat Performance Pack", "Zephyr Wind Tunnel",
]


def main():
    rng = random.Random(SEED)
    data = json.loads(DATA.read_text())

    # --- Employees: unique fake first+last name per PN ---
    employees = data["employees"]
    firsts = FIRST_NAMES[:]
    lasts = LAST_NAMES[:]
    rng.shuffle(firsts)
    rng.shuffle(lasts)
    if len(employees) > min(len(firsts), len(lasts)):
        raise SystemExit("Not enough fake names for %d employees" % len(employees))

    name_by_pn = {}
    fake_by_real = {}
    for i, emp in enumerate(employees):
        fake = f"{firsts[i]} {lasts[i]}"
        name_by_pn[emp["pn"]] = fake
        fake_by_real[emp["name"]] = fake
        emp["name"] = fake

    # Some records carry a PN not present in employees[]; fall back to
    # matching on the real name so those rows are anonymized too.
    for rec in data["records"]:
        fake = name_by_pn.get(rec["pn"]) or fake_by_real.get(rec["name"])
        if fake is None:
            raise SystemExit("Unmapped record: pn=%r name=%r" % (rec["pn"], rec["name"]))
        rec["name"] = fake

    # --- Projects: unique fake name per real project ---
    real_projects = sorted(
        {w["project"] for w in data["wbs"]} - KEEP_PROJECTS
    )
    fakes = FAKE_PROJECTS[:]
    rng.shuffle(fakes)
    if len(real_projects) > len(fakes):
        raise SystemExit("Not enough fake project names for %d projects" % len(real_projects))

    project_map = dict(zip(real_projects, fakes))
    for w in data["wbs"]:
        if w["project"] in project_map:
            w["project"] = project_map[w["project"]]

    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    print("Renamed %d employees:" % len(name_by_pn))
    for emp in employees[:5]:
        print("  pn %s -> %s" % (emp["pn"], emp["name"]))
    print("  ...")
    print("Renamed %d projects:" % len(project_map))
    for old, new in sorted(project_map.items()):
        print("  %r -> %r" % (old, new))
    print("Kept as-is: %s" % ", ".join(sorted(KEEP_PROJECTS)))


if __name__ == "__main__":
    main()
