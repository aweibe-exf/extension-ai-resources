-- Institution name normalization
-- Run in Supabase SQL Editor

-- Penn State (58 + 1 long variant)
UPDATE public.resources SET institution = 'Penn State Extension'
WHERE institution IN (
  'Penn State University',
  'Penn State University- Forest Owner Carbon and Climate Education program'
);

-- Iowa State
UPDATE public.resources SET institution = 'Iowa State University'
WHERE institution = 'Iowa State University Extension and Outreach';

-- Oregon State
UPDATE public.resources SET institution = 'Oregon State University Extension'
WHERE institution IN ('Oregon State University', 'OSU');

-- Oklahoma State
UPDATE public.resources SET institution = 'Oklahoma State University Extension'
WHERE institution IN ('Oklahoma State University', 'OSU Extension');

-- Purdue
UPDATE public.resources SET institution = 'Purdue University'
WHERE institution IN ('Purdue Extension', 'Purdue University Extension');

-- Extension Foundation
UPDATE public.resources SET institution = 'Extension Foundation'
WHERE institution = 'Extension Foundation / NETC';

-- Nebraska
UPDATE public.resources SET institution = 'University of Nebraska-Lincoln Extension'
WHERE institution = 'Nebraska Extension';

-- NC State
UPDATE public.resources SET institution = 'NC State Extension'
WHERE institution IN ('North Carolina State University', 'NCSU');

-- Mississippi State
UPDATE public.resources SET institution = 'Mississippi State University Extension'
WHERE institution = 'Mississippi State University';

-- Ohio State
UPDATE public.resources SET institution = 'Ohio State University Extension'
WHERE institution = 'The Ohio State University';

-- UC ANR
UPDATE public.resources SET institution = 'University of California Agriculture and Natural Resources'
WHERE institution = 'UC Cooperative Extension - Inyo and Mono Counties';

-- Wisconsin (two variants)
UPDATE public.resources SET institution = 'University of Wisconsin-Madison Division of Extension'
WHERE institution IN (
  'University of Wisconsin-Madison Extension',
  'UW-Madison School of Law'
);

-- Kansas State
UPDATE public.resources SET institution = 'Kansas State University'
WHERE institution = 'Kansas State Extension';

-- University of Illinois (both variants)
UPDATE public.resources SET institution = 'University of Illinois Urbana-Champaign'
WHERE institution IN ('University of Illinois Extension', 'University of Illinois');

-- Cornell
UPDATE public.resources SET institution = 'Cornell Cooperative Extension'
WHERE institution = 'Cornell Cooperative Extension of Oneida County';

-- West Virginia State (typo variants)
UPDATE public.resources SET institution = 'West Virginia State University'
WHERE institution IN ('wvsu', 'WVSU');

-- University of Kentucky (typo)
UPDATE public.resources SET institution = 'University of Kentucky'
WHERE institution = 'Univeristy of Kentucky';

-- Virginia Cooperative Extension
UPDATE public.resources SET institution = 'Virginia Cooperative Extension'
WHERE institution = 'Virginia Cooperative Extension / Virginia Tech';

-- University of Tennessee (long description)
UPDATE public.resources SET institution = 'University of Tennessee Extension'
WHERE institution LIKE '%University of Tennessee%';

-- Verify results
SELECT institution, COUNT(*) as n
FROM public.resources
GROUP BY institution
ORDER BY n DESC, institution;
