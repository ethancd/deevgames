class Njt::CommentsController < ApplicationController

  def create
    @comment = Comment.new(params[:comment])
    @game = Game.find(params[:game_id])
    @comment.update_attributes(
      author_id: current_user.id, topic_id: params[:game_id], topic_type: "Game"
      )

    respond_to do |format|
      format.html { redirect_to @game}
      format.json { render json: @game, root: false }
    end
  end

end
