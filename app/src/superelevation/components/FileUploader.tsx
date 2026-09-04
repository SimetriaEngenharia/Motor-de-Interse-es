import React, { useRef } from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '../utils/cn';

interface FileUploaderProps {
  onFileLoaded: (xmlContent: string) => void;
  className?: string;
}

export function FileUploader({ onFileLoaded, className }: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      onFileLoaded(content);
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={cn("flex flex-row items-center justify-center p-2 bg-blue-600 rounded-md text-white hover:bg-blue-500 transition cursor-pointer group text-sm font-semibold", className)}
         onClick={() => fileInputRef.current?.click()}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".xml"
        className="hidden" 
      />
      <FileUp className="w-4 h-4 mr-2" />
      <span>Importar XML</span>
    </div>
  );
}
