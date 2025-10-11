import { useState } from 'react';

function App() {
  // Mode selection: 'genbank' or 'no_genbank'
  const [mode, setMode] = useState(null);

  // Step tracking
  const [currentStep, setCurrentStep] = useState(1);

  // Search and selection state
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
  const [manualTaxonomyId, setManualTaxonomyId] = useState('');
  const [manualSpeciesName, setManualSpeciesName] = useState('');

  // FASTA upload state
  const [fastaText, setFastaText] = useState('');
  const [fastaFile, setFastaFile] = useState(null);
  const [fastaInputMethod, setFastaInputMethod] = useState('text'); // 'text' or 'file'

  // Metadata upload state
  const [metadataFile, setMetadataFile] = useState(null);
  const [metadataDateColumn, setMetadataDateColumn] = useState('');

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

  // Search for species
  const searchSpecies = async () => {
    if (!speciesSearch.trim()) return;

    // Clear previous selections
    setSelectedTaxonomy(null);
    setRefseqResults([]);
    setSelectedRefseq(null);
    setAssemblyId('');
    setNextcladeDatasets([]);
    setSelectedNextclade(null);
    setCurrentStep(1);
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

  // Select taxonomy and fetch RefSeqs
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
      } else {
        setCurrentStep(2);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRefSeqs(false);
    }
  };

  // Select RefSeq and fetch assembly
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

      setCurrentStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAssembly(false);
    }
  };

  // Search Nextclade datasets
  const searchNextclade = async () => {
    if (!selectedTaxonomy) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/nextclade-datasets?species=${encodeURIComponent(selectedTaxonomy.sci_name)}`
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
        // No GenBank mode: use uploaded reference files
        formData.append('refseq_acc', '');
        formData.append('refseq_assembly', '');
        formData.append('species', manualSpeciesName);
        formData.append('taxonomy_id', manualTaxonomyId);

        if (refFastaFile) {
          formData.append('ref_fasta_file', refFastaFile);
        }
        if (refGbffFile) {
          formData.append('ref_gbff_file', refGbffFile);
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
                  onClick={() => {
                    setMode('genbank');
                    setCurrentStep(1);
                  }}
                  className="p-6 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition text-left"
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Search GenBank</h3>
                  <p className="text-sm text-gray-600">Search for a species in NCBI Taxonomy and select a RefSeq reference genome. All GenBank sequences will be downloaded automatically.</p>
                </button>
                <button
                  onClick={() => {
                    setMode('no_genbank');
                    setCurrentStep(1);
                  }}
                  className="p-6 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition text-left"
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Provide Reference Files</h3>
                  <p className="text-sm text-gray-600">Upload your own reference FASTA and GenBank files. Only your provided sequences will be placed on the tree (no GenBank download).</p>
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Species Search (GenBank mode) or Reference Upload (No GenBank mode) */}
          {mode === 'genbank' && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800 pb-2 border-b-2 border-blue-500">1. Select Virus Species</h2>
              <button onClick={() => setMode(null)} className="text-sm text-blue-600 hover:text-blue-800">Change Mode</button>
            </div>
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">1. Select Virus Species</h2>
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
                      setCurrentStep(1);
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
          {currentStep >= 2 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">2. Select Reference Sequence</h2>
              {loadingRefSeqs && (
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  Loading RefSeq entries...
                </div>
              )}
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
                      setCurrentStep(2);
                    }}
                    className="px-4 py-1 text-sm bg-white border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Tree Building Parameters */}
          {currentStep >= 3 && (
            <>
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">3. Nextclade Dataset (Optional)</h2>
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

              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">4. FASTA Sequences (Optional)</h2>
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

              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">5. Tree Building & Filtering Parameters</h2>
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

              <button
                onClick={generateConfig}
                disabled={loading}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium text-lg"
              >
                {loading ? 'Launching...' : 'Launch Analysis'}
              </button>
            </>
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
                    {jobLogs.logs.init && (
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-2">Init Container (Download Config):</h4>
                        <pre className="bg-black text-green-400 p-4 rounded-lg overflow-x-auto text-xs font-mono">
{jobLogs.logs.init}
                        </pre>
                      </div>
                    )}

                    {jobLogs.logs.main && (
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-2">Main Container (Viral Usher):</h4>
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
