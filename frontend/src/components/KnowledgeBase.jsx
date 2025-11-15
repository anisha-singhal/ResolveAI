import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, BookOpen, Upload, Download, Trash2, File, FileText } from 'lucide-react';
import { API } from '@/App';
import { toast } from 'sonner';

const KnowledgeBase = () => {
  const [entries, setEntries] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileDescription, setFileDescription] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchKnowledgeBase();
    fetchFiles();
  }, []);

  const fetchKnowledgeBase = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/knowledge-base`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setEntries(data);
      } else {
        setError('Failed to load knowledge base');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const fetchFiles = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/knowledge-base/files`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setFiles(data);
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file to upload');
      return;
    }

    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (fileDescription) {
        formData.append('description', fileDescription);
      }

      const response = await fetch(`${API}/knowledge-base/files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        toast.success('File uploaded successfully!');
        setSelectedFile(null);
        setFileDescription('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        fetchFiles();
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Failed to upload file');
      }
    } catch (err) {
      toast.error('Failed to connect to server');
    } finally {
      setUploading(false);
    }
  };

  const handleFileDownload = async (fileId, filename) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/knowledge-base/files/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('File downloaded successfully!');
      } else {
        toast.error('Failed to download file');
      }
    } catch (err) {
      toast.error('Failed to connect to server');
    }
  };

  const handleFileDelete = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/knowledge-base/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        toast.success('File deleted successfully!');
        fetchFiles();
      } else {
        toast.error('Failed to delete file');
      }
    } catch (err) {
      toast.error('Failed to connect to server');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (fileType) => {
    if (fileType.includes('pdf')) return <FileText className="h-5 w-5 text-red-400" />;
    if (fileType.includes('word') || fileType.includes('document')) return <FileText className="h-5 w-5 text-blue-400" />;
    if (fileType.includes('image')) return <File className="h-5 w-5 text-green-400" />;
    return <File className="h-5 w-5 text-gray-400" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B5CF6]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6" data-testid="knowledge-base-view">
      <div>
        <h1 className="text-3xl font-bold text-white" data-testid="kb-title">
          <BookOpen className="inline-block mr-3 h-8 w-8" />
          Knowledge Base
        </h1>
        <p className="text-gray-400 mt-1">
          {entries.length} resolved tickets and {files.length} files
        </p>
      </div>

      {/* File Upload Section */}
      <Card className="bg-[#1F2937] border-[#374151]">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Upload className="mr-2 h-5 w-5" />
            Upload Reference Files
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-300">Select File (Max 10MB)</Label>
            <Input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="bg-[#111827] border-[#374151] text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-[#8B5CF6] file:text-white hover:file:bg-[#7C3AED]"
              data-testid="file-input"
            />
            {selectedFile && (
              <p className="text-sm text-gray-400">
                Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">Description (Optional)</Label>
            <Input
              value={fileDescription}
              onChange={(e) => setFileDescription(e.target.value)}
              placeholder="Brief description of this file..."
              className="bg-[#111827] border-[#374151] text-white placeholder:text-gray-500"
              data-testid="file-description-input"
            />
          </div>

          <Button
            onClick={handleFileUpload}
            disabled={!selectedFile || uploading}
            className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white"
            data-testid="upload-button"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload File
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Files Section */}
      {files.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-white flex items-center">
            <File className="mr-2 h-6 w-6" />
            Reference Files
          </h2>
          {files.map((file) => (
            <Card
              key={file.id}
              className="bg-[#1F2937] border-[#374151] hover:border-[#8B5CF6]"
              data-testid={`kb-file-${file.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1">
                    {getFileIcon(file.file_type)}
                    <div className="flex-1">
                      <h4 className="text-white font-semibold">{file.filename}</h4>
                      {file.description && (
                        <p className="text-sm text-gray-400">{file.description}</p>
                      )}
                      <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                        <span>{formatFileSize(file.file_size)}</span>
                        <span>•</span>
                        <span>Uploaded: {new Date(file.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={() => handleFileDownload(file.id, file.filename)}
                      variant="outline"
                      size="sm"
                      className="border-[#374151] text-[#8B5CF6] hover:bg-[#8B5CF6] hover:text-white"
                      data-testid={`download-file-${file.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => handleFileDelete(file.id)}
                      variant="outline"
                      size="sm"
                      className="border-[#374151] text-red-400 hover:bg-red-500 hover:text-white"
                      data-testid={`delete-file-${file.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Separator className="bg-[#374151]" />

      {/* Resolved Tickets Section */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Resolved Tickets</h2>
        {entries.length === 0 ? (
          <Card className="bg-[#1F2937] border-[#374151]">
            <CardContent className="p-8 text-center">
              <BookOpen className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No resolved tickets yet</p>
              <p className="text-gray-500 text-sm mt-2">
                Resolve tickets and click "Send & Save to KB" to add entries
              </p>
            </CardContent>
          </Card>
        ) : (
          entries.map((entry) => (
            <Card
              key={entry.id}
              className="bg-[#1F2937] border-[#374151] hover:border-[#8B5CF6]"
              data-testid={`kb-entry-${entry.id}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-white text-xl">
                    {entry.issue_summary}
                  </CardTitle>
                  <Badge className="bg-[#8B5CF6] text-white">
                    {entry.category}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-gray-400 text-sm font-semibold mb-2">Resolution:</h4>
                  <div className="p-4 bg-[#111827] rounded border border-[#374151]">
                    <p className="text-gray-300 whitespace-pre-wrap">{entry.resolution}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Ticket ID: {entry.ticket_id}</span>
                  <span>Added: {new Date(entry.created_at).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default KnowledgeBase;