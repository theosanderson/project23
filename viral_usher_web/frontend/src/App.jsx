import { useState, useEffect } from 'react';

function App() {
  // Mode selection: 'genbank' or 'no_genbank'
  const [mode, setMode] = useState(null);

  // Search and selection state (GenBank mode)
  const [speciesSearch, setSpeciesSearch] = useState('');
  const [taxonomyResults, setTaxonomyResults] = useState([]);
  const [selectedTaxonomy, setSelectedTaxonomy] = useState(null);

  const [refseqResults, setRefseqResults] = useState([]);
  const [selectedRefseq, setSelectedRefseq] = useState(null);
  const [assemblyId, setAssemblyId] = useState('');

  const [nextcladeDatasets, setNextcladeDatasets] = useState([]);
  const [selectedNextclade, setSelectedNextclade] = useState(null);

  // Reference file uploads (for no_genbank mode)
  const [refFastaFile, setRefFastaFile] = useState(null);
  const [refGbffFile, setRefGbffFile] = useState(null);
  const [refFastaText, setRefFastaText] = useState('');
  const [refGbffText, setRefGbffText] = useState('');
  const [refFastaInputMethod, setRefFastaInputMethod] = useState('file'); // 'file' or 'text'
  const [refGbffInputMethod, setRefGbffInputMethod] = useState('file'); // 'file' or 'text'
  const [manualTaxonomyId, setManualTaxonomyId] = useState('');
  const [manualSpeciesName, setManualSpeciesName] = useState('');

  // FASTA upload state (sequences to place)
  const [fastaText, setFastaText] = useState('');
  const [fastaFile, setFastaFile] = useState(null);
  const [fastaInputMethod, setFastaInputMethod] = useState('text'); // 'text' or 'file'

  // Metadata upload state
  const [metadataFile, setMetadataFile] = useState(null);
  const [metadataDateColumn, setMetadataDateColumn] = useState('');

  // Starting tree (protobuf) upload state
  const [startingTreeFile, setStartingTreeFile] = useState(null);
  const [startingTreeUrl, setStartingTreeUrl] = useState('');
  const [startingTreeInputMethod, setStartingTreeInputMethod] = useState('file'); // 'file' or 'url'

  // Configuration parameters
  const [minLengthProportion, setMinLengthProportion] = useState('0.8');
  const [maxNProportion, setMaxNProportion] = useState('0.25');
  const [maxParsimony, setMaxParsimony] = useState('1000');
  const [maxBranchLength, setMaxBranchLength] = useState('10000');
  const workdir = '/data/viral_usher_data'; // Hardcoded working directory

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingRefSeqs, setLoadingRefSeqs] = useState(false);
  const [loadingAssembly, setLoadingAssembly] = useState(false);
  const [error, setError] = useState('');
  const [jobLogs, setJobLogs] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);
  const [formCollapsed, setFormCollapsed] = useState(false);

  // API base URL
  const API_BASE = '/api';

  // Search for species (GenBank mode)
  const searchSpecies = async () => {
    if (!speciesSearch.trim()) return;

    // Clear previous selections
    setSelectedTaxonomy(null);
    setRefseqResults([]);
    setSelectedRefseq(null);
    setAssemblyId('');
    setNextcladeDatasets([]);
    setSelectedNextclade(null);
    setTaxonomyResults([]);

    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/search-species`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: speciesSearch })
      });

      if (!response.ok) throw new Error('Failed to search species');

      const data = await response.json();
      setTaxonomyResults(data);

      if (data.length === 0) {
        setError('No matches found. Try a different search term.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Select taxonomy and fetch RefSeqs (GenBank mode)
  const selectTaxonomy = async (taxonomy) => {
    setSelectedTaxonomy(taxonomy);
    setLoadingRefSeqs(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/refseqs/${taxonomy.tax_id}`);
      if (!response.ok) throw new Error('Failed to fetch RefSeqs');

      const data = await response.json();
      setRefseqResults(data);

      if (data.length === 0) {
        setError('No RefSeqs found for this taxonomy ID.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRefSeqs(false);
    }
  };

  // Select RefSeq and fetch assembly (GenBank mode)
  const selectRefseq = async (refseq) => {
    setSelectedRefseq(refseq);
    setLoadingAssembly(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/assembly/${refseq.accession}`);
      if (!response.ok) throw new Error('Failed to fetch assembly ID');

      const data = await response.json();
      setAssemblyId(data.assembly_id);

      // Also search for Nextclade datasets
      await searchNextclade();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAssembly(false);
    }
  };

  // Search Nextclade datasets
  const searchNextclade = async (speciesNameOverride = null) => {
    const speciesName = speciesNameOverride || (mode === 'genbank' ? selectedTaxonomy?.sci_name : manualSpeciesName);
    if (!speciesName) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/nextclade-datasets?species=${encodeURIComponent(speciesName)}`
      );
      if (!response.ok) throw new Error('Failed to fetch Nextclade datasets');

      const data = await response.json();
      setNextcladeDatasets(data);
    } catch (err) {
      console.error('Nextclade search error:', err);
      // Non-critical error, don't show to user
    } finally {
      setLoading(false);
    }
  };

  // Load example data
  const loadExampleData = () => {
    setManualTaxonomyId('12345');
    setManualSpeciesName('Test virus');

    // Example reference FASTA
    setRefFastaText(`>reference
GACAACTCAACCACAAGGTAAGTGCAAATGAACTTATAACAGTATAATCGTGCTAGTGGA
TCCCAAAATTCCACGTGGTGATATGGTCCTATAGCGTACGCCTAGTAGACTTGGGTGAAT
GACACGCCGATACTAAGTGGGAATAGTCCGTAGCTCCCTGTGGCCAGTGAGGCTGCGTAG
GGGCGGCTTCCGGAATAGCGTACGCGCCTTTGGGTCCACTCGACAGCTTGAGGCATAGGG`);
    setRefFastaInputMethod('text');

    // Example reference GenBank
    setRefGbffText(`LOCUS       reference                240 bp    DNA     linear   VRL 10-OCT-2025
DEFINITION  Test reference sequence.
ACCESSION   reference
VERSION     reference
KEYWORDS    .
SOURCE      Test virus
  ORGANISM  Test virus
            Viruses.
FEATURES             Location/Qualifiers
     source          1..240
                     /organism="Test virus"
                     /mol_type="genomic DNA"
ORIGIN
        1 gacaactcaa ccacaaggta agtgcaaatg aacttataac agtataatcg tgctagtgga
       61 tcccaaaatt ccacgtggtg atatggtcct atagcgtacg cctagtagac ttgggtgaat
      121 gacacgccga tactaagtgg gaatagtccg tagctccctg tggccagtga ggctgcgtag
      181 gggcggcttc cggaatagcg tacgcgcctt tgggtccact cgacagcttg aggcataggg
//`);
    setRefGbffInputMethod('text');

    // Example sequences to place
    setFastaText(`>sequence_1
GAGAACTCAACCACAAGGTAAGTGCAAATGAACTTATAACAGTATAATCGTGCTAGTGGA
TCCCAAAATTCCACGTGGTGATATGGTCCTATAGCGTACGCCTAGTATACTTGGGTGAAT
GACACGCCGATACTAAGTGGGAATAGTCCGTAGCTCCCTGTGGCCAGTGAGGCTGCGTAG
GGGCGGCTTCCGGAATAGCGTCCGCGCCTTTGGGTCCACTCGACAGCTTGAGGCATAGGG
>sequence_2
GACAACTCAACCACAAGGTAAGTGCAAATGAACTAATAACAGTATAATCGTGCTAGTGGA
TCCCAAAATTCCACGTGGTGATATGGTCCTATAGCGTACGCCTAGTAGACTTGGGTGAAT
GACACGCCGATACTAAGTGTGAATAGTCCGTAGCTCCCGGTGGCCAGTGAGGCTGCGTAG
GGGCGGCTTCCGGAATAGCGTACGCGCCTTTGGTTCCACTCGACAGCTTGAGGCATCGGG
>sequence_3
GACAACTCAACCACAAGGTAAGTGCAAATGAACTTATAACAGTATAATCGTGCTAGTGGA
TCCCAAAATTCCACGTGGTGATATGGTCCTATAGCGTACGCCTAGTAGACTTGGGTGAAT
GACACGCCGATACTAAGTGGGAATAGTCCGTAGCTACCTGTTGCCAGTGATGCTGCGTAC
GGGCGGCTTCCGGAATAGCGTACGCGCCTTTGGGTCCACTCGACAGCTTGAGGCATAGGG`);
    setFastaInputMethod('text');

    // Auto-search for Nextclade datasets when example data is loaded
    searchNextclade('Test virus');
  };

  // Generate config
  const generateConfig = async () => {
    // Stop any previous polling and clear old job logs
    stopJobLogPolling();
    setJobLogs(null);

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();

      // Mode and basic config
      formData.append('no_genbank', mode === 'no_genbank' ? 'true' : 'false');

      if (mode === 'genbank') {
        // GenBank mode: use RefSeq accession
        formData.append('refseq_acc', selectedRefseq?.accession || '');
        formData.append('refseq_assembly', assemblyId);
        formData.append('species', selectedTaxonomy?.sci_name || '');
        formData.append('taxonomy_id', selectedTaxonomy?.tax_id || '');
      } else {
        // No GenBank mode: use uploaded reference files or text
        formData.append('refseq_acc', '');
        formData.append('refseq_assembly', '');
        formData.append('species', manualSpeciesName);
        formData.append('taxonomy_id', manualTaxonomyId);

        if (refFastaInputMethod === 'file' && refFastaFile) {
          formData.append('ref_fasta_file', refFastaFile);
        } else if (refFastaInputMethod === 'text' && refFastaText) {
          formData.append('ref_fasta_text', refFastaText);
        }

        if (refGbffInputMethod === 'file' && refGbffFile) {
          formData.append('ref_gbff_file', refGbffFile);
        } else if (refGbffInputMethod === 'text' && refGbffText) {
          formData.append('ref_gbff_text', refGbffText);
        }
      }

      formData.append('nextclade_dataset', selectedNextclade?.path || '');
      formData.append('nextclade_clade_columns', selectedNextclade?.clade_columns || '');
      formData.append('min_length_proportion', minLengthProportion);
      formData.append('max_N_proportion', maxNProportion);
      formData.append('max_parsimony', maxParsimony);
      formData.append('max_branch_length', maxBranchLength);
      formData.append('workdir', workdir);

      // Add FASTA data (sequences to place)
      if (fastaInputMethod === 'file' && fastaFile) {
        formData.append('fasta_file', fastaFile);
      } else if (fastaInputMethod === 'text' && fastaText) {
        formData.append('fasta_text', fastaText);
      }

      // Add metadata file if provided
      if (metadataFile) {
        formData.append('metadata_file', metadataFile);
      }
      if (metadataDateColumn) {
        formData.append('metadata_date_column', metadataDateColumn);
      }

      // Add starting tree (protobuf) if provided
      if (startingTreeInputMethod === 'file' && startingTreeFile) {
        formData.append('starting_tree_file', startingTreeFile);
      } else if (startingTreeInputMethod === 'url' && startingTreeUrl) {
        formData.append('starting_tree_url', startingTreeUrl);
      }

      const response = await fetch(`${API_BASE}/generate-config`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Failed to launch analysis');

      const data = await response.json();

      // Start polling for job logs if a job was created
      if (data.job_info && data.job_info.success && data.job_info.job_name) {
        startJobLogPolling(data.job_info.job_name);
        setFormCollapsed(true); // Collapse the form after launching
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch job logs
  const fetchJobLogs = async (jobName) => {
    try {
      const response = await fetch(`${API_BASE}/job-logs/${jobName}`);
      if (!response.ok) return;

      const data = await response.json();
      setJobLogs(data);

      // Stop polling if job is complete
      if (data.status === 'succeeded' || data.status === 'failed') {
        stopJobLogPolling();
      }
    } catch (err) {
      console.error('Failed to fetch job logs:', err);
    }
  };

  // Start polling for job logs
  const startJobLogPolling = (jobName) => {
    // Clear any existing interval
    stopJobLogPolling();

    // Fetch immediately
    fetchJobLogs(jobName);

    // Then poll every 3 seconds
    const interval = setInterval(() => fetchJobLogs(jobName), 3000);
    setPollingInterval(interval);
  };

  // Stop polling
  const stopJobLogPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  // Auto-search for Nextclade datasets when required fields are filled (no_genbank mode)
  useEffect(() => {
    if (mode === 'no_genbank' && manualSpeciesName && nextcladeDatasets.length === 0) {
      searchNextclade(manualSpeciesName);
    }
  }, [mode, manualSpeciesName]);

  // Parse URL query parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Mode
    const modeParam = params.get('mode');
    if (modeParam === 'genbank' || modeParam === 'no_genbank') {
      setMode(modeParam);
    }

    // Starting tree URL (protobuf)
    const startingTreeUrl = params.get('startingTreeUrl');
    if (startingTreeUrl) {
      setStartingTreeUrl(startingTreeUrl);
      setStartingTreeInputMethod('url');
    }

    // No GenBank mode parameters
    const taxonomyId = params.get('taxonomyId');
    if (taxonomyId) {
      setManualTaxonomyId(taxonomyId);
    }

    const speciesName = params.get('speciesName');
    if (speciesName) {
      setManualSpeciesName(speciesName);
    }

    const refFastaUrl = params.get('refFastaUrl');
    if (refFastaUrl) {
      // Fetch the FASTA content and populate the text field
      fetch(refFastaUrl)
        .then(res => res.text())
        .then(text => {
          setRefFastaText(text);
          setRefFastaInputMethod('text');
        })
        .catch(err => console.error('Failed to fetch reference FASTA:', err));
    }

    const refGbffUrl = params.get('refGbffUrl');
    if (refGbffUrl) {
      // Fetch the GenBank content and populate the text field
      fetch(refGbffUrl)
        .then(res => res.text())
        .then(text => {
          setRefGbffText(text);
          setRefGbffInputMethod('text');
        })
        .catch(err => console.error('Failed to fetch reference GenBank:', err));
    }

    // GenBank mode parameters
    const refseqAcc = params.get('refseqAcc');
    if (refseqAcc) {
      // Note: This would require additional logic to auto-select the refseq
      // For now, just store it - full implementation would need to trigger searches
      console.log('RefSeq accession from URL:', refseqAcc);
    }

    // FASTA sequences URL
    const fastaUrl = params.get('fastaUrl');
    if (fastaUrl) {
      fetch(fastaUrl)
        .then(res => res.text())
        .then(text => {
          setFastaText(text);
          setFastaInputMethod('text');
        })
        .catch(err => console.error('Failed to fetch FASTA sequences:', err));
    }

    // Configuration parameters
    const minLength = params.get('minLengthProportion');
    if (minLength) setMinLengthProportion(minLength);

    const maxN = params.get('maxNProportion');
    if (maxN) setMaxNProportion(maxN);

    const maxPars = params.get('maxParsimony');
    if (maxPars) setMaxParsimony(maxPars);

    const maxBranch = params.get('maxBranchLength');
    if (maxBranch) setMaxBranchLength(maxBranch);

    // Nextclade dataset path
    const nextcladeDataset = params.get('nextcladeDataset');
    if (nextcladeDataset) {
      // Store for later matching when datasets are loaded
      // This will be used to auto-select the dataset
      console.log('Nextclade dataset from URL:', nextcladeDataset);
    }

    // Metadata date column
    const dateColumn = params.get('metadataDateColumn');
    if (dateColumn) setMetadataDateColumn(dateColumn);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Viral Usher Tree Builder</h1>
          <p className="text-gray-600 mb-8">Build viral phylogenetic trees from sequence data</p>

          {/* Edit Parameters Button (shown when form is collapsed) */}
          {formCollapsed && (
            <div className="mb-6">
              <button
                onClick={() => setFormCollapsed(false)}
                className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Parameters
              </button>
            </div>
          )}

          {/* Tree Building Form (collapsible) */}
          {!formCollapsed && (
            <>
              {/* Step 0: Mode Selection */}
              {!mode && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">Choose Mode</h2>
                  <p className="text-gray-600 mb-4">Select how you want to provide the reference genome:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={() => setMode('genbank')}
                      className="p-6 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition text-left"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Search GenBank</h3>
                      <p className="text-sm text-gray-600">Search for a species in NCBI Taxonomy and select a RefSeq reference genome. All GenBank sequences will be downloaded automatically.</p>
                    </button>
                    <button
                      onClick={() => setMode('no_genbank')}
                      className="p-6 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition text-left"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Provide Reference Files</h3>
                      <p className="text-sm text-gray-600">Upload your own reference FASTA and GenBank files. Only your provided sequences will be placed on the tree (no GenBank download).</p>
                    </button>
                  </div>
                </div>
              )}

              {/* GenBank Mode Workflow */}
              {mode === 'genbank' && (
                <>
                  {/* Step 1: Species Search */}
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-semibold text-gray-800 pb-2 border-b-2 border-blue-500">1. Select Virus Species</h2>
                      <button onClick={() => setMode(null)} className="text-sm text-blue-600 hover:text-blue-800">Change Mode</button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Search for your virus of interest:</label>
                        <input
                          type="text"
                          value={speciesSearch}
                          onChange={(e) => setSpeciesSearch(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && searchSpecies()}
                          placeholder="e.g., Zika virus"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        />
                        <button
                          onClick={searchSpecies}
                          disabled={loading || !speciesSearch.trim()}
                          className="mt-3 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium"
                        >
                          {loading ? 'Searching...' : 'Search'}
                        </button>
                      </div>

                      {taxonomyResults.length > 0 && !selectedTaxonomy && !loadingRefSeqs && (
                        <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                          {taxonomyResults.map((tax) => (
                            <div
                              key={tax.tax_id}
                              onClick={() => selectTaxonomy(tax)}
                              className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition"
                            >
                              {tax.sci_name} <span className="text-gray-500">(Tax ID: {tax.tax_id})</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {loadingRefSeqs && (
                        <div className="flex items-center gap-2 text-blue-600">
                          <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                          Loading RefSeq entries...
                        </div>
                      )}

                      {selectedTaxonomy && !loadingRefSeqs && (
                        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 flex items-center justify-between">
                          <div>
                            <span className="font-medium">Selected:</span> {selectedTaxonomy.sci_name} <span className="text-gray-600">(Tax ID: {selectedTaxonomy.tax_id})</span>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedTaxonomy(null);
                              setRefseqResults([]);
                              setSelectedRefseq(null);
                              setAssemblyId('');
                              setNextcladeDatasets([]);
                              setSelectedNextclade(null);
                            }}
                            className="px-4 py-1 text-sm bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition"
                          >
                            Change
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 2: RefSeq Selection */}
                  {selectedTaxonomy && (
                    <div className="mb-8">
                      <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">2. Select Reference Sequence</h2>
                      {refseqResults.length > 0 && !selectedRefseq && !loadingRefSeqs && (
                        <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                          {refseqResults.map((refseq, idx) => (
                            <div
                              key={idx}
                              className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition"
                              onClick={() => selectRefseq(refseq)}
                            >
                              <strong className="text-gray-900">{refseq.accession}</strong>: {refseq.title}
                              {refseq.strain && refseq.strain !== 'No strain' && (
                                <div className="text-sm text-gray-600 mt-1">
                                  Strain: {refseq.strain}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {loadingAssembly && (
                        <div className="flex items-center gap-2 text-blue-600">
                          <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                          Loading assembly information...
                        </div>
                      )}
                      {selectedRefseq && !loadingAssembly && (
                        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 flex items-center justify-between">
                          <div>
                            <div className="mb-1">
                              <strong className="text-gray-900">Selected RefSeq:</strong> {selectedRefseq.accession}
                            </div>
                            <div>
                              <strong className="text-gray-900">Assembly:</strong> {assemblyId}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedRefseq(null);
                              setAssemblyId('');
                              setNextcladeDatasets([]);
                              setSelectedNextclade(null);
                            }}
                            className="px-4 py-1 text-sm bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition"
                          >
                            Change
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* No GenBank Mode Workflow */}
              {mode === 'no_genbank' && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-800 pb-2 border-b-2 border-blue-500">1. Provide Reference Files</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={loadExampleData}
                        className="px-4 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                      >
                        Load Example Data
                      </button>
                      <button onClick={() => setMode(null)} className="text-sm text-blue-600 hover:text-blue-800">Change Mode</button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Taxonomy ID *
                        <div className="text-xs text-gray-500 font-normal mt-1">NCBI Taxonomy ID for your organism</div>
                      </label>
                      <input
                        type="text"
                        value={manualTaxonomyId}
                        onChange={(e) => setManualTaxonomyId(e.target.value)}
                        placeholder="e.g., 64320"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Species Name *
                        <div className="text-xs text-gray-500 font-normal mt-1">Scientific name of your organism</div>
                      </label>
                      <input
                        type="text"
                        value={manualSpeciesName}
                        onChange={(e) => setManualSpeciesName(e.target.value)}
                        placeholder="e.g., Zika virus"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Reference FASTA *
                        <div className="text-xs text-gray-500 font-normal mt-1">Reference genome in FASTA format</div>
                      </label>
                      <div className="flex gap-4 mb-2">
                        <button
                          onClick={() => setRefFastaInputMethod('file')}
                          className={`px-4 py-2 rounded-lg transition text-sm ${
                            refFastaInputMethod === 'file'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          Upload File
                        </button>
                        <button
                          onClick={() => setRefFastaInputMethod('text')}
                          className={`px-4 py-2 rounded-lg transition text-sm ${
                            refFastaInputMethod === 'text'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          Paste Text
                        </button>
                      </div>
                      {refFastaInputMethod === 'file' ? (
                        <>
                          <input
                            type="file"
                            accept=".fasta,.fa,.fna"
                            onChange={(e) => setRefFastaFile(e.target.files?.[0] || null)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                          />
                          {refFastaFile && (
                            <div className="mt-2 text-sm text-gray-600">
                              Selected: {refFastaFile.name}
                            </div>
                          )}
                        </>
                      ) : (
                        <textarea
                          value={refFastaText}
                          onChange={(e) => setRefFastaText(e.target.value)}
                          rows={6}
                          placeholder=">reference&#10;ATCGATCG..."
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition font-mono text-sm"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Reference GenBank (gbff) *
                        <div className="text-xs text-gray-500 font-normal mt-1">Reference genome annotations in GenBank format</div>
                      </label>
                      <div className="flex gap-4 mb-2">
                        <button
                          onClick={() => setRefGbffInputMethod('file')}
                          className={`px-4 py-2 rounded-lg transition text-sm ${
                            refGbffInputMethod === 'file'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          Upload File
                        </button>
                        <button
                          onClick={() => setRefGbffInputMethod('text')}
                          className={`px-4 py-2 rounded-lg transition text-sm ${
                            refGbffInputMethod === 'text'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          Paste Text
                        </button>
                      </div>
                      {refGbffInputMethod === 'file' ? (
                        <>
                          <input
                            type="file"
                            accept=".gbff,.gbk,.gb"
                            onChange={(e) => setRefGbffFile(e.target.files?.[0] || null)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                          />
                          {refGbffFile && (
                            <div className="mt-2 text-sm text-gray-600">
                              Selected: {refGbffFile.name}
                            </div>
                          )}
                        </>
                      ) : (
                        <textarea
                          value={refGbffText}
                          onChange={(e) => setRefGbffText(e.target.value)}
                          rows={8}
                          placeholder="LOCUS..."
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition font-mono text-sm"
                        />
                      )}
                    </div>
                    {manualTaxonomyId && manualSpeciesName &&
                     ((refFastaInputMethod === 'file' && refFastaFile) || (refFastaInputMethod === 'text' && refFastaText)) &&
                     ((refGbffInputMethod === 'file' && refGbffFile) || (refGbffInputMethod === 'text' && refGbffText)) && (
                      <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mt-4">
                        <span className="font-medium text-green-800">Ready to proceed!</span> All required files provided. Scroll down to configure additional options and launch the analysis.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Nextclade Dataset Selection (both modes) */}
              {mode && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">
                    {mode === 'genbank' ? '3' : '2'}. Nextclade Dataset (Optional)
                  </h2>
                  {nextcladeDatasets.length > 0 ? (
                    <>
                      <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                        {nextcladeDatasets.map((dataset, idx) => (
                          <div
                            key={idx}
                            className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition ${
                              selectedNextclade?.path === dataset.path
                                ? 'bg-blue-50 border-l-4 border-l-blue-500'
                                : 'hover:bg-blue-50'
                            }`}
                            onClick={() => setSelectedNextclade(dataset)}
                          >
                            <strong className="text-gray-900">{dataset.path}</strong>
                            <br />
                            <span className="text-sm text-gray-600">{dataset.name}</span>
                          </div>
                        ))}
                      </div>
                      {selectedNextclade && (
                        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mt-4">
                          <strong className="text-gray-900">Selected:</strong> {selectedNextclade.path}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-600 italic">No Nextclade datasets found for this species.</p>
                  )}
                </div>
              )}

              {/* Starting Tree Upload (both modes, optional) */}
              {mode && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-purple-500">
                    Starting Tree - Update Mode (Optional)
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Provide an existing UShER protobuf tree (.pb.gz) to update with new sequences instead of building from scratch.
                  </p>
                  <div className="space-y-4">
                    <div className="flex gap-4 mb-4">
                      <button
                        onClick={() => setStartingTreeInputMethod('file')}
                        className={`px-4 py-2 rounded-lg transition ${
                          startingTreeInputMethod === 'file'
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Upload File
                      </button>
                      <button
                        onClick={() => setStartingTreeInputMethod('url')}
                        className={`px-4 py-2 rounded-lg transition ${
                          startingTreeInputMethod === 'url'
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Provide URL
                      </button>
                    </div>

                    {startingTreeInputMethod === 'file' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Upload Protobuf File
                          <div className="text-xs text-gray-500 font-normal mt-1">UShER protobuf tree file (optimized.pb.gz or similar)</div>
                        </label>
                        <input
                          type="file"
                          accept=".pb.gz,.pb"
                          onChange={(e) => setStartingTreeFile(e.target.files?.[0] || null)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition"
                        />
                        {startingTreeFile && (
                          <div className="mt-2 text-sm text-gray-600">
                            Selected: {startingTreeFile.name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Protobuf URL
                          <div className="text-xs text-gray-500 font-normal mt-1">URL to an existing UShER protobuf tree file</div>
                        </label>
                        <input
                          type="url"
                          value={startingTreeUrl}
                          onChange={(e) => setStartingTreeUrl(e.target.value)}
                          placeholder="https://example.com/tree.pb.gz"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* FASTA Sequences to Place (both modes) */}
              {mode && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">
                    {mode === 'genbank' ? '4' : '3'}. FASTA Sequences {mode === 'no_genbank' ? '(Required)' : '(Optional)'}
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    {mode === 'no_genbank'
                      ? 'Provide the sequences you want to place on the tree.'
                      : 'Optionally provide additional sequences to place on the tree.'}
                  </p>
                  <div className="space-y-4">
                    <div className="flex gap-4 mb-4">
                      <button
                        onClick={() => setFastaInputMethod('text')}
                        className={`px-4 py-2 rounded-lg transition ${
                          fastaInputMethod === 'text'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Paste Text
                      </button>
                      <button
                        onClick={() => setFastaInputMethod('file')}
                        className={`px-4 py-2 rounded-lg transition ${
                          fastaInputMethod === 'file'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Upload File
                      </button>
                    </div>

                    {fastaInputMethod === 'text' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Paste FASTA sequences
                          <div className="text-xs text-gray-500 font-normal mt-1">Paste your FASTA formatted sequences here</div>
                        </label>
                        <textarea
                          value={fastaText}
                          onChange={(e) => setFastaText(e.target.value)}
                          rows={8}
                          placeholder=">sequence1&#10;ATCGATCG..."
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition font-mono text-sm"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Upload FASTA file
                          <div className="text-xs text-gray-500 font-normal mt-1">Select a FASTA file from your computer</div>
                        </label>
                        <input
                          type="file"
                          accept=".fasta,.fa,.fna,.txt"
                          onChange={(e) => setFastaFile(e.target.files?.[0] || null)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        />
                        {fastaFile && (
                          <div className="mt-2 text-sm text-gray-600">
                            Selected: {fastaFile.name}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Custom Metadata Upload (both modes) */}
              {mode && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">
                    {mode === 'genbank' ? '5' : '4'}. Custom Metadata (Optional)
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Upload a TSV file with custom metadata for your sequences. First column should be sequence names matching your FASTA.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Metadata TSV File
                        <div className="text-xs text-gray-500 font-normal mt-1">Tab-separated values file</div>
                      </label>
                      <input
                        type="file"
                        accept=".tsv,.txt"
                        onChange={(e) => setMetadataFile(e.target.files?.[0] || null)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      />
                      {metadataFile && (
                        <div className="mt-2 text-sm text-gray-600">
                          Selected: {metadataFile.name}
                        </div>
                      )}
                    </div>
                    {metadataFile && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Date Column Name (Optional)
                          <div className="text-xs text-gray-500 font-normal mt-1">Name of the column containing dates (if any)</div>
                        </label>
                        <input
                          type="text"
                          value={metadataDateColumn}
                          onChange={(e) => setMetadataDateColumn(e.target.value)}
                          placeholder="e.g., collection_date"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tree Building Parameters (both modes) */}
              {mode && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">
                    {mode === 'genbank' ? '6' : '5'}. Tree Building & Filtering Parameters
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Minimum Length Proportion
                        <div className="text-xs text-gray-500 font-normal mt-1">Filter sequences by minimum length (0-1)</div>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={minLengthProportion}
                        onChange={(e) => setMinLengthProportion(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Maximum N Proportion
                        <div className="text-xs text-gray-500 font-normal mt-1">Maximum proportion of ambiguous bases (0-1)</div>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={maxNProportion}
                        onChange={(e) => setMaxNProportion(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Maximum Parsimony
                        <div className="text-xs text-gray-500 font-normal mt-1">Maximum private substitutions allowed</div>
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={maxParsimony}
                        onChange={(e) => setMaxParsimony(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Maximum Branch Length
                        <div className="text-xs text-gray-500 font-normal mt-1">Maximum substitutions per branch</div>
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={maxBranchLength}
                        onChange={(e) => setMaxBranchLength(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Launch Button */}
              {mode && (
                <button
                  onClick={generateConfig}
                  disabled={loading || (mode === 'no_genbank' && (!fastaFile && !fastaText))}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium text-lg"
                >
                  {loading ? 'Launching...' : 'Launch Analysis'}
                </button>
              )}
            </>
          )}

          {error && (
            <div className="mt-6 bg-red-50 border-2 border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}

          {jobLogs && (
            <div className="mt-6 bg-gray-50 border-2 border-gray-300 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                Job Status:
                <span className={`px-3 py-1 rounded text-sm font-medium ${
                  jobLogs.status === 'succeeded' ? 'bg-green-100 text-green-800' :
                  jobLogs.status === 'failed' ? 'bg-red-100 text-red-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {jobLogs.status}
                </span>
              </h3>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Job Name: <code className="text-gray-800">{jobLogs.job_name}</code></p>
                  {jobLogs.pod_name && <p className="text-sm text-gray-600">Pod: <code className="text-gray-800">{jobLogs.pod_name}</code></p>}
                </div>

                {jobLogs.logs && typeof jobLogs.logs === 'object' && (
                  <>
                    {jobLogs.logs.main && (
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-2">Viral Usher Logs:</h4>
                        <pre className="bg-black text-green-400 p-4 rounded-lg overflow-x-auto text-xs font-mono max-h-96">
{jobLogs.logs.main}
                        </pre>
                      </div>
                    )}
                  </>
                )}

                {jobLogs.status === 'running' && (
                  <div className="flex items-center gap-2 text-blue-600 text-sm">
                    <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    Job is running... (auto-refreshing every 3 seconds)
                  </div>
                )}

                {/* S3 Results Section */}
                {jobLogs.s3_results && jobLogs.s3_results.files && jobLogs.s3_results.files.length > 0 && (
                  <div className="mt-6 bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg p-6">
                    <h4 className="text-xl font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Results Available for Download
                    </h4>
                    <p className="text-sm text-gray-600 mb-4">
                      {jobLogs.s3_results.upload_complete ? (
                        <>All {jobLogs.s3_results.total_files} output files have been uploaded to S3 and are ready to download:</>
                      ) : (
                        <>{jobLogs.s3_results.total_files} file{jobLogs.s3_results.total_files !== 1 ? 's' : ''} uploaded so far (upload in progress)...</>
                      )}
                    </p>
                    <div className="bg-white rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
                      {jobLogs.s3_results.files.map((file, idx) => (
                        <div key={idx} className="px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-blue-50 transition flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-mono text-sm text-gray-800 truncate" title={file.filename}>
                              {file.filename}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {file.is_taxonium && (() => {
                              // Construct Taxonium URL client-side
                              const encodedUrl = encodeURIComponent(file.url);
                              const taxoniumUrl = `https://taxonium.org/?protoUrl=${encodedUrl}&xType=x_dist`;
                              return (
                                <a
                                  href={taxoniumUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-shrink-0 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                  View in Taxonium
                                </a>
                              );
                            })()}
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-green-200">
                      <p className="text-sm text-gray-600">
                        <strong>S3 Location:</strong> <code className="bg-white px-2 py-1 rounded text-xs">s3://{jobLogs.s3_results.bucket}/{jobLogs.s3_results.prefix}/</code>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {loading && (
            <div className="mt-6 flex items-center gap-2 text-blue-600 justify-center">
              <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              Loading...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
