document.addEventListener('DOMContentLoaded', async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const userEmail = urlParams.get('email');

    if (!userEmail) {
        alert("No email found. Please log in.");
        return;
    }

    try {
        // Fetch user record by email to get the user ID
        const userResponse = await fetch(`http://127.0.0.1:8090/api/collections/users/records?filter=email="${encodeURIComponent(userEmail)}"`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!userResponse.ok) {
            throw new Error('Failed to fetch user record');
        }

        const userData = await userResponse.json();
        if (userData.items.length === 0) {
            throw new Error('No user found with this email');
        }

        const userId = userData.items[0].id;

        // Fetch files associated with this user's ID
        const fileResponse = await fetch(`http://127.0.0.1:8090/api/collections/file_storage/records?filter=user="${userId}"`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (fileResponse.ok) {
            const data = await fileResponse.json();
            const fileList = document.getElementById('fileList');
            fileList.innerHTML = ''; // Clear any existing content

            if (data.items.length > 0) {
                // Sort files by date (latest first)
                data.items.sort((a, b) => new Date(b.date) - new Date(a.date));

                data.items.forEach(file => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    const fileUrl = `http://127.0.0.1:8090/api/files/file_storage/${file.id}/${file.file[0]}`;
                    const thumbUrl = `${fileUrl}?thumb=300x300`;

                    let filePreview = '';
                    if (file.file[0].match(/\.(jpg|jpeg|png)$/)) {
                        filePreview = `<img src="${thumbUrl}" alt="${file.file[0]}" style="max-width: 300px; max-height: 300px;">`;
                    } else if (file.file[0].endsWith('.pdf')) {
                        filePreview = `<iframe src="${fileUrl}" frameborder="0" style="width: 300px; height: 300px;"></iframe>`;
                    } else {
                        filePreview = `<a href="${fileUrl}" target="_blank">${file.file[0]}</a>`;
                    }

                    fileItem.innerHTML = `
                        <h3>${file.filename}</h3>
                        <p><strong>Category:</strong> ${file.category}</p>
                        <p><strong>Date:</strong> ${file.date}</p>
                        ${filePreview}
                        <p><strong>File URL:</strong> <a href="${fileUrl}" target="_blank">${fileUrl}</a></p>
                        <button class="delete-button" data-file-id="${file.id}">Delete File</button>
                        <div class="share-buttons">
                            <a href="share.html?filename=${encodeURIComponent(file.filename)}&category=${encodeURIComponent(file.category)}&date=${encodeURIComponent(file.date)}&fileUrl=${encodeURIComponent(fileUrl)}">
                                Share File
                            </a>
                        </div>
                    `;
                    fileList.appendChild(fileItem);
                });
            } else {
                fileList.innerHTML = '<p>No files found for this user.</p>';
            }
        } else {
            const errorText = await fileResponse.text(); // Read error message
            console.error('Error fetching files:', errorText);
            alert('Error fetching files: ' + errorText);
        }
    } catch (error) {
        console.error('Error fetching files:', error);
        alert('An error occurred while fetching files.');
    }

    // Set up the link to navigate to the appointment scheduling page
    document.getElementById('scheduleAppointment').addEventListener('click', function() {
        window.location.href = `appointment.html?email=${encodeURIComponent(userEmail)}`;
    });
});

document.getElementById('uploadForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const fileInput = document.getElementById('files');
    const category = document.getElementById('category').value;
    const filename = document.getElementById('filename').value;
    const date = document.getElementById('date').value;
    const userEmail = new URLSearchParams(window.location.search).get('email');

    if (!userEmail) {
        alert('No user email found. Please log in.');
        return;
    }

    try {
        // Retrieve user record by email to get the user ID
        const userResponse = await fetch(`http://127.0.0.1:8090/api/collections/users/records?filter=email="${encodeURIComponent(userEmail)}"`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!userResponse.ok) {
            throw new Error('Failed to fetch user record');
        }

        const userData = await userResponse.json();
        if (userData.items.length === 0) {
            throw new Error('No user found with this email');
        }

        const userId = userData.items[0].id;

        // Upload files and associate them with the user ID
        const formData = new FormData();
        formData.append('category', category);
        formData.append('filename', filename);
        formData.append('date', date);
        formData.append('user', userId);

        Array.from(fileInput.files).forEach(file => {
            formData.append('file', file);
        });

        const uploadResponse = await fetch('http://127.0.0.1:8090/api/collections/file_storage/records', {
            method: 'POST',
            body: formData
        });

        if (uploadResponse.ok) {
            alert('Files uploaded successfully!');
            document.getElementById('uploadForm').reset();
            location.reload();
        } else {
            const errorText = await uploadResponse.text(); // Read error message
            console.error('Error uploading files:', errorText);
            alert('Error uploading files: ' + errorText);
        }
    } catch (error) {
        console.error('Error uploading files:', error);
        alert('An error occurred while uploading files.');
    }
});

document.getElementById('fileList').addEventListener('click', async function(event) {
    if (event.target && event.target.classList.contains('delete-button')) {
        const fileId = event.target.getAttribute('data-file-id');
        
        if (confirm('Are you sure you want to delete this file?')) {
            try {
                const deleteResponse = await fetch(`http://127.0.0.1:8090/api/collections/file_storage/records/${fileId}`, {
                    method: 'DELETE'
                });

                if (deleteResponse.ok) {
                    alert('File deleted successfully!');
                    location.reload(); // Reload to update file list
                } else {
                    const errorText = await deleteResponse.text(); // Read error message
                    console.error('Error deleting file:', errorText);
                    alert('Error deleting file: ' + errorText);
                }
            } catch (error) {
                console.error('Error deleting file:', error);
                alert('An error occurred while deleting the file.');
            }
        }
    }
});

