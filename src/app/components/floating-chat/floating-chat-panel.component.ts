import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { ChatToggleService, ChatState } from '../../services/chat-toggle.service';
import { ChatService } from '../../services/chat.service';
import { VoiceService, VoiceState } from '../../services/voice.service';
import { Message } from '../../models/message.model';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-floating-chat-panel',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSelectModule,
    CdkDrag,
    CdkDragHandle
  ],
  templateUrl: './floating-chat-panel.component.html',
  styleUrls: ['./floating-chat-panel.component.scss']
})
export class FloatingChatPanelComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild('chatPanel') private chatPanel!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  isOpen$: Observable<boolean>;
  state$: Observable<ChatState>;
  messages$: Observable<Message[]>;
  isLoading$: Observable<boolean>;
  voiceState$: Observable<VoiceState>;

  messageControl = new FormControl('', {
    validators: [Validators.required, Validators.maxLength(2000)],
    updateOn: 'change'
  });

  // Voice properties
  selectedLanguage = 'en-US'; // Will be set in ngOnInit
  private destroy$ = new Subject<void>();

  // Resize state
  isResizing = false;
  resizeDirection = '';
  startX = 0;
  startY = 0;
  startWidth = 0;
  startHeight = 0;

  // Drag state
  dragPosition = { x: 20, y: 20 };

  // Scroll state
  private shouldAutoScroll = true;
  private previousMessageCount = 0;
  private isUserScrolling = false;
  private isLoading = false;

  // Context toggle
  useContext = true;

  // Quick actions
  showQuickActions = false;
  quickActions = [
    { label: 'Show Tables', prompt: 'Show me all tables in the database', icon: 'storage' },
    { label: 'Customer Info', prompt: 'Show customer information', icon: 'people' },
    { label: 'Recent Orders', prompt: 'Show recent orders from the last 7 days', icon: 'receipt' },
  ];

  constructor(
    private chatToggleService: ChatToggleService,
    private chatService: ChatService,
    private voiceService: VoiceService
  ) {
    this.isOpen$ = this.chatToggleService.isOpen$;
    this.state$ = this.chatToggleService.state$;
    this.messages$ = this.chatService.messages$;
    this.isLoading$ = this.chatService.isLoading$;
    this.voiceState$ = this.voiceService.voiceState$;
  }

  ngOnInit(): void {
    // Set default language based on browser
    this.selectedLanguage = this.voiceService.getDefaultLanguage();

    const state = this.chatToggleService.getState();
    this.dragPosition = state.position;

    this.isLoading$.pipe(takeUntil(this.destroy$)).subscribe(loading => {
      this.isLoading = loading;
    });

    this.messages$.pipe(takeUntil(this.destroy$)).subscribe(messages => {
      if (messages.length > this.previousMessageCount) {
        this.previousMessageCount = messages.length;
        if (!this.isUserScrolling) {
          this.shouldAutoScroll = true;
        }
      }
    });

    // Subscribe to voice state - KEY FIX: Only update on final transcript
    this.voiceState$.pipe(takeUntil(this.destroy$)).subscribe(voiceState => {
      // Show combined transcript (final + interim) while recording
      if (voiceState.isRecording) {
        const displayText = voiceState.interimTranscript
          ? (voiceState.transcript + ' ' + voiceState.interimTranscript).trim()
          : voiceState.transcript;

        if (displayText) {
          this.messageControl.setValue(displayText, { emitEvent: false });
        }
      }
      // When recording stops, only use final transcript
      else if (voiceState.transcript && !voiceState.isRecording) {
        this.messageControl.setValue(voiceState.transcript, { emitEvent: false });
      }
    });
  }

  ngAfterViewChecked(): void {
    if (this.shouldAutoScroll && !this.isUserScrolling) {
      setTimeout(() => {
        this.scrollToBottom();
        this.shouldAutoScroll = false;
      }, 50);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.voiceService.stopRecording();
  }

  // Voice methods
  toggleVoiceRecording(): void {
    if (this.voiceService.isRecording()) {
      this.voiceService.stopRecording();
    } else {
      // Clear input before starting new recording
      this.messageControl.setValue('', { emitEvent: false });
      this.voiceService.startRecording(this.selectedLanguage);
    }
  }

  clearVoiceError(): void {
    this.voiceService.clearTranscript();
  }

  closeChat(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.voiceService.stopRecording();
    this.chatToggleService.closeChat();
  }

  onOverlayClick(event: MouseEvent): void {
    event.stopPropagation();
    this.closeChat();
  }

  minimizeChat(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const currentState = this.chatToggleService.getState();
    this.chatToggleService.setSize(currentState.size === 'minimized' ? 'normal' : 'minimized');
  }

  maximizeChat(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const currentState = this.chatToggleService.getState();
    this.chatToggleService.setSize(currentState.size === 'fullscreen' ? 'normal' : 'fullscreen');
  }

  expandChat(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const currentState = this.chatToggleService.getState();
    this.chatToggleService.setSize(currentState.size === 'expanded' ? 'normal' : 'expanded');
  }

  sendMessage(): void {
    // Stop any ongoing recording first
    this.voiceService.stopRecording();

    if (this.messageControl.valid && this.messageControl.value?.trim()) {
      const message = this.messageControl.value.trim();

      // Clear input
      this.messageControl.setValue('', { emitEvent: false });
      this.messageControl.markAsPristine();
      this.messageControl.markAsUntouched();

      // Clear voice transcript
      this.voiceService.clearTranscript();

      this.isUserScrolling = false;
      this.shouldAutoScroll = true;

      this.chatService.sendMessage(message, this.useContext).subscribe({
        next: () => {
          this.scrollToBottom();
          this.messageInput?.nativeElement?.focus();
        },
        error: (error: any) => {
          console.error('Chat error:', error);
          this.scrollToBottom();
        }
      });
    }
  }

  stopRequest(): void {
    this.chatService.stopCurrentRequest();
  }

  clearChat(): void {
    if (confirm('Clear chat history?')) {
      this.chatService.clearMessages();
    }
  }

  exportChat(): void {
    this.chatService.exportChat();
  }

  toggleContext(): void {
    this.useContext = !this.useContext;
  }

  private scrollToBottom(): void {
    try {
      if (this.scrollContainer?.nativeElement) {
        const element = this.scrollContainer.nativeElement;
        requestAnimationFrame(() => {
          element.scrollTop = element.scrollHeight;
        });
      }
    } catch (err) {
      console.debug('Scroll error:', err);
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!this.isLoading && this.messageControl.valid && this.messageControl.value?.trim()) {
        this.sendMessage();
      }
    }
  }

  onScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const isAtBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 50;
    this.isUserScrolling = !isAtBottom;
    this.shouldAutoScroll = isAtBottom;
  }

  startResize(event: MouseEvent, direction: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.isResizing = true;
    this.resizeDirection = direction;
    this.startX = event.clientX;
    this.startY = event.clientY;
    const state = this.chatToggleService.getState();
    this.startWidth = state.width;
    this.startHeight = state.height;
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isResizing) return;

    const deltaX = event.clientX - this.startX;
    const deltaY = event.clientY - this.startY;
    let newWidth = this.startWidth;
    let newHeight = this.startHeight;

    if (this.resizeDirection.includes('w')) {
      newWidth = Math.max(300, Math.min(window.innerWidth * 0.9, this.startWidth - deltaX));
    }
    if (this.resizeDirection.includes('e')) {
      newWidth = Math.max(300, Math.min(window.innerWidth * 0.9, this.startWidth + deltaX));
    }
    if (this.resizeDirection.includes('n')) {
      newHeight = Math.max(400, Math.min(window.innerHeight * 0.9, this.startHeight - deltaY));
    }
    if (this.resizeDirection.includes('s')) {
      newHeight = Math.max(400, Math.min(window.innerHeight * 0.9, this.startHeight + deltaY));
    }

    this.chatToggleService.updateDimensions(newWidth, newHeight);
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isResizing = false;
    this.resizeDirection = '';
  }

  onDragEnded(event: any): void {
    this.dragPosition = event.source.getFreeDragPosition();
    this.chatToggleService.updatePosition(this.dragPosition.x, this.dragPosition.y);
  }

  executeQuickAction(prompt: string): void {
    if (prompt?.trim()) {
      this.messageControl.setValue(prompt.trim());
      this.sendMessage();
    }
  }
}
