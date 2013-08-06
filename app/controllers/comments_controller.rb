class CommentsController < ApplicationController

  before_filter :auth_only!, only: [:update, :destroy, :undestroy]

  def index
    @post = Post.includes(comments: [:author, :children]).find(params[:post_id])
  end

  def create

    unless user_signed_in? #&& user.not_a_guest
      flash = "Must be signed in to comment"
      redirect_to "#{post_url(params[:post_id])}#comments"
    else

      @comment = Comment.new(params[:comment])
      @comment.author_id = current_user.id
      @comment.topic_id = params[:post_id]
      @comment.topic_type = "Post"

      if @comment.save
        redirect_to "#{post_url(params[:post_id])}#comments"
      else
        render :new
      end
    end
  end

  def update
    @comment = Comment.find(params[:id])
    if @comment.update_attributes(params[:comment])
      redirect_to "#{post_url(params[:post_id])}#comments"
    else
      render :edit
    end
  end

  def destroy
    @comment = Comment.find(params[:id])
    @comment.deleted = true
    @comment.save!

    redirect_to "#{post_url(params[:post_id])}#comments"
  end

  def undestroy
    @comment = Comment.find(params[:id])
    @comment.deleted = false
    @comment.save!

    redirect_to "#{post_url(params[:post_id])}#comments"
  end

  private
    def auth_only!
      unless current_user.admin ||
             current_user == Comment.find(params[:id]).author
        redirect_to :root
      end
    end
end
