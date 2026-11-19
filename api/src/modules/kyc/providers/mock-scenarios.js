/**
 * KYC Offline Scenario Database (₹0 Test Cases)
 * Provides comprehensive, realistic data scenarios for:
 * 1. Driving License (Heavy Equipment Operator, LMV Only, Expired, Invalid)
 * 2. Vehicle RC Roadworthiness (Fully Compliant, Expired PUC, Expired Fitness, Expired Insurance, Suspended)
 * 3. E-Challan (Clean 0 Fines, 8 Unpaid Fines like TS09GB8634, Portal Unreachable like failed_backends TS)
 */

export const DL_SCENARIOS = {
  // Case 1: Heavy Machinery Operator (Verified & Compliant)
  'TS0920210001234': {
    scenarioCode: 'DL_HEAVY_VALID',
    title: 'Heavy Equipment Operator (Valid)',
    expectedVerdict: 'VERIFIED',
    data: {
      dlNumber: 'TS0920210001234',
      name: 'PANDIRI VINAY KUMAR',
      dob: '1990-05-15',
      status: 'ACTIVE',
      validFrom: '2015-06-20',
      validTill: '2035-06-19',
      issueDate: '2015-06-20',
      rtoName: 'RTO HYDERABAD CENTRAL, TELANGANA',
      rtoCode: 'TS-09',
      state: 'TELANGANA',
      fatherOrHusbandName: 'PANDIRI RAJESHWAR RAO',
      address: 'PLOT 42, ROAD NO 12, BANJARA HILLS, HYDERABAD, TELANGANA 500034',
      vehicleClasses: [
        { class: 'LMV', description: 'Light Motor Vehicle', issueDate: '2015-06-20' },
        { class: 'HGMV', description: 'Heavy Goods Motor Vehicle (Tippers, Dumpers)', issueDate: '2018-09-10' },
        { class: 'TRANS', description: 'Commercial Transport Vehicle', issueDate: '2018-09-10' },
        { class: 'CRANE', description: 'Mobile / Tower Crane Endorsement', issueDate: '2020-01-15' },
      ],
      badgeNumber: 'TS/09/BDG/8821',
      badgeIssueDate: '2018-09-10',
    },
  },

  // Case 2: Authentic License but LMV Only (Car/Bike driver - Rejected for Cranes/Tippers)
  'TS01620240001534': {
    scenarioCode: 'DL_LMV_ONLY',
    title: 'Light Motor Vehicle Only (LMV - Rejection)',
    expectedVerdict: 'REJECTED',
    data: {
      dlNumber: 'TS01620240001534',
      name: 'PANDIRI VINAY KUMAR',
      dob: '2005-03-08',
      status: 'ACTIVE',
      validFrom: '2024-03-08',
      validTill: '2040-03-07',
      issueDate: '2024-03-08',
      rtoName: 'RTO NIZAMABAD, TELANGANA',
      rtoCode: 'TS-16',
      state: 'TELANGANA',
      fatherOrHusbandName: 'PANDIRI RAJESHWAR RAO',
      address: 'H NO 3-4-12, SUBHASH NAGAR, NIZAMABAD, TELANGANA 503001',
      vehicleClasses: [
        { class: 'MCWG', description: 'Motor Cycle With Gear', issueDate: '2024-03-08' },
        { class: 'LMV', description: 'Light Motor Vehicle', issueDate: '2024-03-08' },
      ],
      badgeNumber: null,
      badgeIssueDate: null,
    },
  },

  // Case 3: Expired Driving License (Rejected)
  'MH1220050009999': {
    scenarioCode: 'DL_EXPIRED',
    title: 'Expired Heavy Driver License',
    expectedVerdict: 'REJECTED',
    data: {
      dlNumber: 'MH1220050009999',
      name: 'RAMESH SHINDE',
      dob: '1980-01-15',
      status: 'ACTIVE',
      validFrom: '2005-01-15',
      validTill: '2022-01-01', // Past date
      issueDate: '2005-01-15',
      rtoName: 'RTO PUNE, MAHARASHTRA',
      rtoCode: 'MH-12',
      state: 'MAHARASHTRA',
      fatherOrHusbandName: 'ANANDRAO SHINDE',
      address: 'PLOT 15, KOTHRUD, PUNE, MAHARASHTRA 411038',
      vehicleClasses: [
        { class: 'HGMV', description: 'Heavy Goods Motor Vehicle', issueDate: '2005-01-15' },
        { class: 'TRANS', description: 'Commercial Transport Vehicle', issueDate: '2005-01-15' },
      ],
      badgeNumber: 'MH/12/BDG/1092',
      badgeIssueDate: '2005-01-15',
    },
  },
};

export const RC_SCENARIOS = {
  // Case 1: Fully Compliant Commercial Equipment (Tata Prima Tipper)
  'TS16FD7966': {
    scenarioCode: 'RC_COMPLIANT',
    title: 'Commercial Tipper (100% Roadworthy Pass)',
    expectedVerdict: 'VERIFIED',
    data: {
      vehicleNumber: 'TS16FD7966',
      ownerName: 'EQUIPRENT LOGISTICS & INFRASTRUCTURE PVT LTD',
      makerModel: 'TATA MOTORS PRIMA 2830.K HEAVY TIPPER',
      vehicleClass: 'Heavy Goods Commercial Vehicle (HGMV)',
      bodyType: 'TIPPER / DUMPER',
      fuelType: 'DIESEL',
      engineNumber: '497TCIC80N123456',
      chassisNumber: 'MAT618012E4A98765',
      registrationDate: '2021-03-15',
      rtoName: 'RTO NIZAMABAD, TELANGANA',
      status: 'ACTIVE',
      fitness: {
        status: 'ACTIVE',
        validTill: '2029-10-15',
      },
      insurance: {
        status: 'ACTIVE',
        company: 'ICICI LOMBARD GENERAL INSURANCE CO LTD',
        policyNumber: '3001/2021/88765432',
        validTill: '2027-11-30',
      },
      puc: {
        status: 'ACTIVE',
        certificateNumber: 'TS16PUC20268819',
        validTill: '2027-08-20',
      },
      nationalPermit: {
        status: 'ACTIVE',
        permitNumber: 'TS/NP/2021/4432',
        validTill: '2026-11-30',
        type: 'NATIONAL_PERMIT_GOODS',
      },
    },
  },

  // Case 2: Expired Pollution PUC (Rejected)
  'DL01AB1234': {
    scenarioCode: 'RC_PUC_EXPIRED',
    title: 'Ashok Leyland Crane (Expired PUC Rejection)',
    expectedVerdict: 'REJECTED',
    data: {
      vehicleNumber: 'DL01AB1234',
      ownerName: 'METRO INFRASTRUCTURE PROJECTS LTD',
      makerModel: 'ASHOK LEYLAND 1618 CRANE TRUCK',
      vehicleClass: 'Heavy Commercial Vehicle (HCV)',
      bodyType: 'MOBILE CRANE',
      fuelType: 'DIESEL',
      engineNumber: 'HINO67890N2233',
      chassisNumber: 'MB1A16180E2345678',
      registrationDate: '2020-05-10',
      rtoName: 'RTO BURARI, DELHI',
      status: 'ACTIVE',
      fitness: {
        status: 'ACTIVE',
        validTill: '2028-05-10',
      },
      insurance: {
        status: 'ACTIVE',
        company: 'NEW INDIA ASSURANCE CO LTD',
        policyNumber: 'NIA/2020/99887766',
        validTill: '2027-04-12',
      },
      puc: {
        status: 'EXPIRED',
        certificateNumber: 'DL01PUC20230001',
        validTill: '2023-11-01', // Expired
      },
      nationalPermit: {
        status: 'ACTIVE',
        permitNumber: 'DL/NP/2020/1234',
        validTill: '2026-05-10',
      },
    },
  },

  // Case 3: Expired Commercial Fitness (Rejected)
  'MH14DE9012': {
    scenarioCode: 'RC_FITNESS_EXPIRED',
    title: 'CAT 320D Excavator (Expired Fitness Rejection)',
    expectedVerdict: 'REJECTED',
    data: {
      vehicleNumber: 'MH14DE9012',
      ownerName: 'BHARAT EARTHMOVERS & EXCAVATION',
      makerModel: 'CATERPILLAR 320D HYDRAULIC EXCAVATOR',
      vehicleClass: 'Heavy Construction Equipment Vehicle (CEV)',
      bodyType: 'EXCAVATOR',
      fuelType: 'DIESEL',
      engineNumber: 'CATC71N887766',
      chassisNumber: 'CAT320DX099887766',
      registrationDate: '2019-01-10',
      rtoName: 'RTO PIMPRI-CHINCHWAD, MAHARASHTRA',
      status: 'ACTIVE',
      fitness: {
        status: 'EXPIRED',
        validTill: '2024-01-10', // Expired
      },
      insurance: {
        status: 'ACTIVE',
        company: 'TATA AIG GENERAL INSURANCE',
        policyNumber: '0158872291',
        validTill: '2027-05-01',
      },
      puc: {
        status: 'ACTIVE',
        certificateNumber: 'MH14PUC20261109',
        validTill: '2027-05-01',
      },
    },
  },

  // Case 4: Expired Insurance (Rejected)
  'KA04ME5678': {
    scenarioCode: 'RC_INSURANCE_EXPIRED',
    title: 'JCB 3DX Backhoe (Expired Insurance Rejection)',
    expectedVerdict: 'REJECTED',
    data: {
      vehicleNumber: 'KA04ME5678',
      ownerName: 'KARNATAKA HEAVY LEASING CORP',
      makerModel: 'JCB 3DX SUPER BACKHOE LOADER',
      vehicleClass: 'Construction Equipment Vehicle (CEV)',
      bodyType: 'BACKHOE LOADER',
      fuelType: 'DIESEL',
      engineNumber: 'JCB444N112233',
      chassisNumber: 'JCB3DX0KA04998877',
      registrationDate: '2022-03-15',
      rtoName: 'RTO YESHWANTHPUR, BENGALURU',
      status: 'ACTIVE',
      fitness: {
        status: 'ACTIVE',
        validTill: '2029-01-01',
      },
      insurance: {
        status: 'EXPIRED',
        company: 'UNITED INDIA INSURANCE',
        policyNumber: 'UIIC/2022/776655',
        validTill: '2024-03-15', // Expired
      },
      puc: {
        status: 'ACTIVE',
        certificateNumber: 'KA04PUC20260012',
        validTill: '2027-01-01',
      },
    },
  },

  // Case 5: Suspended Registration (Rejected)
  'HR55XX4444': {
    scenarioCode: 'RC_SUSPENDED',
    title: 'Komatsu Excavator (Suspended Registration Rejection)',
    expectedVerdict: 'REJECTED',
    data: {
      vehicleNumber: 'HR55XX4444',
      ownerName: 'HARYANA INFRA LEASING',
      makerModel: 'KOMATSU PC210-10M0 EXCAVATOR',
      vehicleClass: 'Construction Equipment Vehicle (CEV)',
      engineNumber: 'KOMATSU210ENG999',
      chassisNumber: 'KMTPC2100E0998877',
      status: 'SUSPENDED',
      fitness: { status: 'ACTIVE', validTill: '2028-01-01' },
      insurance: { status: 'ACTIVE', validTill: '2028-01-01' },
      puc: { status: 'ACTIVE', validTill: '2028-01-01' },
    },
  },
};

export const CHALLAN_SCENARIOS = {
  // Case 1: Clean Vehicle (0 Pending Challans - Verified Pass)
  'TS16FD7966': {
    scenarioCode: 'CHALLAN_CLEAN',
    title: 'Clean Vehicle (0 Pending Challans)',
    expectedVerdict: 'VERIFIED',
    data: {
      rcNumber: 'TS16FD7966',
      totalChallans: 1,
      pendingChallansCount: 0,
      totalPendingAmount: 0,
      hasPendingChallans: false,
      checkedPortals: ['TS', 'ALL'],
      failedBackends: [],
      successfulBackends: ['TS', 'ECHALLAN'],
      homeState: 'TS',
      challans: [
        {
          number: 1,
          challanNumber: 'TS169876543210',
          offenseDetails: 'Minor Route Diversion (Settled)',
          challanPlace: 'WARANGAL CIRCLE, TELANGANA',
          challanDate: '2022-04-12',
          state: 'TS',
          amount: 200,
          status: 'PAID',
          rawStatus: 'PAID',
          paymentDate: '2022-04-15',
          transactionId: 'TXN-TS-2022-998811',
        },
      ],
    },
  },

  // Case 2: Vehicle with 8 Unpaid Traffic Fines (e.g. Yamaha FZS TS09GB8634)
  'TS09GB8634': {
    scenarioCode: 'CHALLAN_FINES_TS',
    title: 'Active Unpaid Fines (8 Tickets totaling ₹5,350)',
    expectedVerdict: 'REJECTED',
    data: {
      rcNumber: 'TS09GB8634',
      totalChallans: 9,
      pendingChallansCount: 8,
      totalPendingAmount: 5350,
      hasPendingChallans: true,
      checkedPortals: ['TS', 'ALL'],
      failedBackends: [],
      successfulBackends: ['TS', 'ECHALLAN'],
      homeState: 'TS',
      challans: [
        {
          number: 1,
          challanNumber: 'TS09E1029384',
          offenseDetails: 'Dangerous driving / Excessive speeding in commercial corridor',
          challanPlace: 'CYBER TOWERS JUNCTION, HYDERABAD',
          challanDate: '2024-08-14',
          state: 'TS',
          amount: 1000,
          status: 'UNPAID',
          rawStatus: 'UNPAID',
        },
        {
          number: 2,
          challanNumber: 'TS09E1029385',
          offenseDetails: 'Jumping red traffic signal / stop line violation',
          challanPlace: 'MEHDIPATNAM RING ROAD, HYDERABAD',
          challanDate: '2024-07-22',
          state: 'TS',
          amount: 1000,
          status: 'UNPAID',
          rawStatus: 'UNPAID',
        },
        {
          number: 3,
          challanNumber: 'TS09E1029386',
          offenseDetails: 'Operating vehicle without mandatory protective helmet / PPE gear',
          challanPlace: 'GACHIBOWLI ORR TOLL GATE',
          challanDate: '2024-06-18',
          state: 'TS',
          amount: 500,
          status: 'UNPAID',
          rawStatus: 'UNPAID',
        },
        {
          number: 4,
          challanNumber: 'TS09E1029387',
          offenseDetails: 'Driving in prohibited one-way / wrong side transit',
          challanPlace: 'KUKATPALLY MAIN ROAD',
          challanDate: '2024-05-11',
          state: 'TS',
          amount: 1000,
          status: 'UNPAID',
          rawStatus: 'UNPAID',
        },
        {
          number: 5,
          challanNumber: 'TS09E1029388',
          offenseDetails: 'Mobile phone usage while operating vehicle',
          challanPlace: 'HITECH CITY UNDERPASS',
          challanDate: '2024-04-03',
          state: 'TS',
          amount: 1000,
          status: 'UNPAID',
          rawStatus: 'UNPAID',
        },
        {
          number: 6,
          challanNumber: 'TS09E1029389',
          offenseDetails: 'Improper parking obstructing heavy commercial flow',
          challanPlace: 'SECUNDERABAD STATION CIRCLE',
          challanDate: '2024-03-15',
          state: 'TS',
          amount: 250,
          status: 'UNPAID',
          rawStatus: 'UNPAID',
        },
        {
          number: 7,
          challanNumber: 'TS09E1029390',
          offenseDetails: 'Disobeying lawful police traffic directive',
          challanPlace: 'JUBILEE HILLS CHECKPOST',
          challanDate: '2024-02-19',
          state: 'TS',
          amount: 500,
          status: 'UNPAID',
          rawStatus: 'UNPAID',
        },
        {
          number: 8,
          challanNumber: 'TS09E1029391',
          offenseDetails: 'Minor highway overspeed tolerance violation (5km/h over)',
          challanPlace: 'OUTER RING ROAD KM 42',
          challanDate: '2024-01-28',
          state: 'TS',
          amount: 100,
          status: 'UNPAID',
          rawStatus: 'UNPAID',
        },
        {
          number: 9,
          challanNumber: 'TS09E1029392',
          offenseDetails: 'Pollution Under Control compliance delay (Settled)',
          challanPlace: 'NAMPALLY RTO COMPOUND',
          challanDate: '2023-11-05',
          state: 'TS',
          amount: 500,
          status: 'PAID',
          rawStatus: 'PAID',
          paymentDate: '2023-11-10',
          transactionId: 'TXN-TS-2023-1029392',
        },
      ],
    },
  },

  // Case 3: State Traffic Police Portal Unreachable (e.g. failed_backends TS)
  'TS08UNREACHABLE': {
    scenarioCode: 'CHALLAN_PORTAL_TIMEOUT',
    title: 'State Traffic Police Portal Unreachable',
    expectedVerdict: 'REJECTED',
    data: {
      rcNumber: 'TS08UNREACHABLE',
      totalChallans: 0,
      pendingChallansCount: 0,
      totalPendingAmount: 0,
      hasPendingChallans: false,
      checkedPortals: ['TS', 'ALL'],
      failedBackends: ['TS'],
      successfulBackends: ['ECHALLAN'],
      homeState: 'TS',
      challans: [],
    },
  },
};
