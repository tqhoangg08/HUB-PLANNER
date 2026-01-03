import Papa from 'papaparse';

export interface StudentRecord {
  gpa4: number;
  credits: number;
  drl: number;
}

export interface RankingDataset {
    id: string;
    name: string;
    url: string;
}

export const AVAILABLE_DATASETS: RankingDataset[] = [
    { 
        id: 'hk2_2425', 
        name: 'HK2 2024-2025', 
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTb91w3JSJm6yvm8gYd6FbvYRK_taabZhEoxlJHBW1Dyt5EIyBxf3ZQZdwdIqc0JQ/pub?output=tsv' 
    },
    { 
        id: 'hk1_2425', 
        name: 'HK1 2024-2025', 
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS-EZ6FLjTI5HpIoeRSguBwVMxI3PYRA3TuHgnKYMJmvvX35VgmFjTYbXXfrDNpjiR45tf7qE0iFZo7/pub?output=tsv' 
    },
    { 
        id: 'hk2_2324', 
        name: 'HK2 2023-2024', 
        url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQTzwrflTUq35OOyF68BG3IVzsRuy4siAGqCw2HvRNQeElRlCEUR0iA_JRYQpC79w/pub?output=tsv' 
    }
];

// Simple cache to prevent re-fetching
const cache: Record<string, StudentRecord[]> = {};

export const fetchRankingData = async (datasetIdOrName: string): Promise<StudentRecord[] | null> => {
  let selectedDataset = AVAILABLE_DATASETS.find(d => d.id === datasetIdOrName);
  
  // If not found by ID, try Context Matching (Auto-detect)
  if (!selectedDataset) {
      const lowerName = datasetIdOrName.toLowerCase();
      if (lowerName.includes('học kỳ 1') || lowerName.includes('hk1') || lowerName.includes('hk 1')) {
          selectedDataset = AVAILABLE_DATASETS.find(d => d.id === 'hk1_2425');
      } else if (lowerName.includes('học kỳ 2') || lowerName.includes('hk2') || lowerName.includes('hk 2')) {
          selectedDataset = AVAILABLE_DATASETS.find(d => d.id === 'hk2_2425'); // Default to latest HK2
      }
  }

  // Fallback default if still null
  if (!selectedDataset) {
      selectedDataset = AVAILABLE_DATASETS[0];
  }

  const url = selectedDataset.url;
  if (cache[url]) return cache[url];

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const text = await response.text();

    return new Promise((resolve) => {
      Papa.parse(text, {
        header: true,
        delimiter: '\t',
        skipEmptyLines: true,
        complete: (results) => {
          const data: StudentRecord[] = results.data.map((row: any) => {
            // Flexible key matching
            const gpaKey = Object.keys(row).find(k => k.includes('thang 4')) || '';
            const creditsKey = Object.keys(row).find(k => k.includes('TC')) || '';
            const drlKey = Object.keys(row).find(k => k.includes('RL')) || '';

            // Handle Vietnamese float format
            const parseNum = (val: string) => {
                if(!val) return 0;
                return parseFloat(val.toString().replace(',', '.'));
            }

            return {
              gpa4: parseNum(row[gpaKey]),
              credits: parseInt(row[creditsKey]) || 0,
              drl: parseInt(row[drlKey]) || 0
            };
          });
          
          cache[url] = data;
          resolve(data);
        },
        error: () => resolve(null)
      });
    });
  } catch (error) {
    console.error("Failed to fetch ranking data", error);
    return null;
  }
};